// State Management unique to Overview Workflow
let currentExtractedSummary = "";

// -----------------------------------------------------
// ORDER OVERVIEW POPUP & PROMPT MANAGEMENT
// -----------------------------------------------------
async function handleConfirmPrompt() {
    if (!navigator.onLine) return Dialog.show("No Internet", "Connect to the internet to submit your order.", "alert");
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) { await Dialog.show("Session Expired", "Please login again."); window.location.replace("index.html"); return; }

    // Hybrid Fee Calculation Setup
    const city = localStorage.getItem('faster_city') || "Lahore";
    const area = localStorage.getItem('faster_area') || "";
    const block = localStorage.getItem('faster_block') || ""; 
    
    document.getElementById('overviewAddress').value = fullSavedAddress || document.getElementById('editAddress').value || "";

    const currentFee = await getFinalDeliveryFee(city, area, block, 
        document.getElementById('overviewAddress').value.trim()
    );

    // Manual Summary Extraction Logic
    const customerBubbles = document.querySelectorAll('.customer-bubble');
    let manualSummaryList = [];

    customerBubbles.forEach(bubble => {
        let text = bubble.innerText.trim();
        if (text) manualSummaryList.push("👉 " + text);
    });

    const captionData = draftData.images.filter(i => i.data.caption).map(i => "🖼️ Photo: " + i.data.caption);
    manualSummaryList = [...manualSummaryList, ...captionData];

    currentExtractedSummary = manualSummaryList.join("\n");

    if (!currentExtractedSummary && draftData.voices.length === 0 && draftData.images.length === 0 && draftData.videos.length === 0) {
        alert("Please enter order details or attach a file first.");
        return;
    }

    if (!currentExtractedSummary) {
        currentExtractedSummary = "Order details are in attached voice notes/images.";
    }

    // Populate Overview Fields
    document.getElementById('overviewName').value = document.getElementById('editName').value || "";
    document.getElementById('overviewAddress').value = fullSavedAddress || document.getElementById('editAddress').value || "";
    
    document.getElementById('overviewDcAmount').innerText = `Rs. ${currentFee}`;
    const blockDisplay = document.getElementById('overviewBlockDisplay');
    if (matchedBlockName) {
        blockDisplay.innerText = '✅ Block: ' + matchedBlockName;
    } else {
        blockDisplay.innerText = '📍 Block: (using area fee)';
    }
    
    document.getElementById('overviewSummaryText').innerText = currentExtractedSummary;
    document.getElementById('overviewSchedule').value = ""; 

    // Render Image Drafts Preview
    const imgContainer = document.getElementById('overviewImages');
    imgContainer.innerHTML = '';
    draftData.images.forEach(imgObj => {
        const objUrl = URL.createObjectURL(imgObj.data.file || imgObj.data);
        const cap = (imgObj.data.caption || "").replace(/'/g, "\\'").replace(/"/g, "&quot;"); 
        imgContainer.innerHTML += `
            <div class="relative w-[70px] h-[70px] rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-transform" 
                 onclick="openFullWithCaption('${objUrl}', '${cap}')">
                <img src="${objUrl}" class="w-full h-full object-cover">
                ${cap ? `<div class="absolute bottom-0 w-full bg-black/60 text-white text-[8px] p-0.5 text-center truncate">Caption</div>` : ''}
            </div>
        `;
    });

    // Render Voice Drafts Preview
    const voiceContainer = document.getElementById('overviewVoices');
    voiceContainer.innerHTML = '';
    draftData.voices.forEach((vceObj, index) => {
        voiceContainer.innerHTML += `
            <div class="flex items-center gap-2 bg-blue-100 text-[#14508C] px-3 py-2 rounded-lg text-xs font-bold border border-blue-200">
                <i class="fas fa-microphone"></i> Voice Note attached (${index + 1})
            </div>
        `;
    });

    // Display Popup Modal
    document.getElementById('orderOverviewModal').classList.remove('hidden');
    document.getElementById('orderOverviewModal').classList.add('flex');
}

function closeOrderOverview() {
    document.getElementById('orderOverviewModal').classList.add('hidden');
    document.getElementById('orderOverviewModal').classList.remove('flex');
}

function openFullWithCaption(srcUrl, captionText) {
    const fv = document.getElementById('fullView'); 
    const fc = document.getElementById('fullCaption');
    fv.style.display = 'flex';
    document.getElementById('fullContent').innerHTML = `<img src="${srcUrl}" class="max-w-full max-h-[85vh] rounded object-contain transition-transform duration-300">`;
    
    if (captionText) {
        fc.innerText = captionText;
        fc.classList.remove('hidden');
    } else {
        fc.classList.add('hidden');
    }

    fv.onclick = function() {
        this.style.display = 'none';
        fc.classList.add('hidden');
    };
}

// Final Submission Execution Flow
async function confirmOrderFromOverview() {
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) return;

    const btn = document.getElementById('overviewSubmitBtn');

    // Inline Error Display Helper
    function showInlineError(title, message) {
        let existingError = document.getElementById('inlineOrderError');
        if(existingError) existingError.remove();

        const errDiv = document.createElement('div');
        errDiv.id = 'inlineOrderError';
        errDiv.className = 'bg-red-50 border border-red-200 p-3 mb-4 rounded-xl w-full flex gap-3 items-start shadow-sm transition-all';
        errDiv.innerHTML = `
            <i class="fas fa-exclamation-circle text-red-500 text-xl mt-0.5"></i>
            <div>
                <h3 class="text-sm font-extrabold text-red-800">${title}</h3>
                <p class="text-xs font-semibold text-red-600 mt-0.5">${message}</p>
            </div>
        `;
        btn.parentNode.insertBefore(errDiv, btn); 
        setTimeout(() => {
            let errorToRemove = document.getElementById('inlineOrderError');
            if(errorToRemove) errorToRemove.remove();
        }, 8000); 
    }

    let customerCity = localStorage.getItem('faster_city');
    let customerArea = localStorage.getItem('faster_area');

    if (!customerArea || customerArea === "null" || !customerCity) {
        if (!customerId || customerId.trim() === '' || isNaN(customerId)) {
            if (typeof Dialog !== 'undefined') {
                await Dialog.show("Area Missing 📍", "Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.", "alert");
            } else {
                alert("Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.");
            }
            window.location.href = "profile.html";
            return;
        }
        try {
            const { data: custData } = await _supabase.from('customers').select('city, area').eq('customer_id', customerId).single();
            if (custData && custData.area) {
                customerCity = custData.city;
                customerArea = custData.area;
                localStorage.setItem('faster_city', customerCity);
                localStorage.setItem('faster_area', customerArea);
            } else {
                if (typeof Dialog !== 'undefined') {
                    await Dialog.show("Area Missing 📍", "Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.", "alert");
                } else {
                    alert("Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.");
                }
                window.location.href = "profile.html"; 
                return;
            }
        } catch(e) {
            showInlineError("Network Error", "Area fetch nahi ho saka, internet check karein.");
            return;
        }
    }

    const safeAreaToSave = (customerArea || "").trim().toLowerCase();

    if (customerCity === "Other City" || customerArea === "Other Area") {
        showInlineError("🚀 Coming Soon!", "Maaf kijiye, abhi hamari service aapke ilaqay mein dastiyab nahi hai.");
        return; 
    }

    // Supabase Se Operation Timing Context Fetching
    let openHour = 8; 
    let closeHour = 1; 
    let realDBAreaName = customerArea; 

    try {
        const { data: areaData } = await _supabase
            .from('delivery_areas')
            .select('area_name, is_active, open_hour, close_hour') 
            .eq('city', customerCity)
            .ilike('area_name', customerArea) 
            .maybeSingle();

        if (areaData) {
            realDBAreaName = areaData.area_name;

            if (areaData.is_active === false) {
                showInlineError("⚠️ Service Unavailable", `Abhi ${realDBAreaName} mein hamari delivery service aarzi taur par band hai.`);
                return; 
            }
            if (areaData.open_hour !== null) openHour = areaData.open_hour;
            if (areaData.close_hour !== null) closeHour = areaData.close_hour;
        }
    } catch (err) {
        console.error("Area & Time check error: ", err);
    }

    const name = document.getElementById('overviewName').value.trim();
    const addr = document.getElementById('overviewAddress').value.trim(); 
    const scheduleTime = document.getElementById('overviewSchedule').value; 
    
    if(!name || !addr) {
        showInlineError("Missing Information", "Please enter your Name and Address to proceed.");
        return;
    }

    // Dynamic Operating Hours Time Check Logic
    function timeToMinutes(val, fallback) {
        if (val === null || val === undefined || val === '') return fallback * 60;
        if (typeof val === 'string' && val.includes(':')) {
            const parts = val.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        return parseInt(val) * 60;
    }

    function formatTimeMsg(val, fallback) {
        let h = fallback;
        let m = 0;
        if (val != null && val !== '') {
            if (typeof val === 'string' && val.includes(':')) {
                const parts = val.split(':');
                h = parseInt(parts[0]);
                m = parseInt(parts[1]);
            } else {
                h = parseInt(val);
            }
        }
        let ampm = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12;
        h12 = h12 ? h12 : 12;
        let mStr = m < 10 ? '0' + m : m;
        return `${h12}:${mStr} ${ampm}`;
    }

    const openMins = timeToMinutes(openHour, 8); 
    const closeMins = timeToMinutes(closeHour, 17); 
    
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let isShopClosed = false;
    if (openMins <= closeMins) {
        isShopClosed = (currentMins < openMins) || (currentMins >= closeMins);
    } else {
        isShopClosed = (currentMins >= closeMins) && (currentMins < openMins);
    }

    const openStr = formatTimeMsg(openHour, 8);
    const closeStr = formatTimeMsg(closeHour, 17);

    if (isShopClosed && !scheduleTime) {
        const msg = `Is waqt service time khatm hogya hai, aap apna order schedule kar sakte hain. (Timings: ${openStr} se ${closeStr})`;
        showInlineError("🕒 Service Closed", msg);
        return; 
    }

    if (scheduleTime) {
        const schedDate = new Date(scheduleTime);
        const schedMins = schedDate.getHours() * 60 + schedDate.getMinutes();
        
        let isSchedClosed = false;
        if (openMins <= closeMins) {
            isSchedClosed = (schedMins < openMins) || (schedMins >= closeMins);
        } else {
            isSchedClosed = (schedMins >= closeMins) && (schedMins < openMins);
        }

        if (isSchedClosed) {
            showInlineError("🕒 Invalid Schedule Time", `Aap band waqt mein order schedule nahi kar sakte. Hamari service ${openStr} se ${closeStr} tak open rehti hai, kripya open hour ke mutabiq time chunein.`);
            return; 
        }
    }

    btn.disabled = true; 
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`; 
    btn.classList.replace('bg-orange-600', 'bg-gray-400');
    
    try {
        const editNameEl = document.getElementById('editName');
        if (editNameEl) editNameEl.value = name;
        
        const editAddressEl = document.getElementById('editAddress');
        if (editAddressEl) editAddressEl.value = addr;
        
        fullSavedAddress = addr;
        
        await _supabase.from('customers').update({ name: name, address: addr }).eq('email', session.user.email);

        // Safe Media Cloud Upload Handling - ab errors chup nahi rahenge, list mein collect hote hain
        const uploadErrors = [];
        const uploadAll = async (items, prefix, defaultExt) => {
            if (!items || items.length === 0) return "";
            const promises = items.map(async (item) => {
                try {
                    const file = item.data.file || item.data;
                    return await uploadToR2(file, "order-media", { mediaType: prefix });
                } catch (err) {
                    console.error(`Upload fail (${prefix}):`, err);
                    uploadErrors.push(`${prefix}: ${err.message || err}`);
                    return null; 
                }
            });
            const urls = await Promise.all(promises);
            return urls.filter(url => url !== null).join(","); 
        };
        
        const [imgURLs, vidURLs, vceURLs, docURLs] = await Promise.all([
            uploadAll(draftData.images, 'image', 'jpg'), uploadAll(draftData.videos, 'video', 'mp4'),
            uploadAll(draftData.voices, 'voice', 'webm'), uploadAll(draftData.docs, 'docs', 'pdf')
        ]);

        // Agar koi bhi file upload fail hui to order place hone se PEHLE customer ko dikhao
        if (uploadErrors.length > 0) {
            const proceed = await Dialog.show(
                "⚠️ Media Upload Failed",
                `Kuch files upload nahi ho saki:\n${uploadErrors.join("\n")}\n\nKya order text ke saath aage badhayein?`,
                "confirm"
            );
            if (!proceed) {
                btn.disabled = false;
                btn.innerHTML = `Confirm & Place Order <i class="fas fa-check-circle ml-1"></i>`;
                btn.classList.replace('bg-gray-400', 'bg-orange-600');
                return;
            }
        }

        let finalStatus = 'pending';
        let scheduledAtValue = null;
        if (scheduleTime) {
            finalStatus = 'scheduled'; 
            scheduledAtValue = new Date(scheduleTime).toISOString();
        }

        const userBlock = localStorage.getItem('faster_block') || "";
        const finalFee = await getFinalDeliveryFee(customerCity, customerArea, userBlock, addr);

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone, 
            ...(customerId && !isNaN(customerId) ? { customer_id: customerId } : {}),
            customer_name: name, 
            delivery_address: addr, 
            area: realDBAreaName, 
            order_details: currentExtractedSummary, 
            image_url: imgURLs, 
            video_url: vidURLs, 
            voice_url: vceURLs, 
            doc_url: docURLs, 
            status: finalStatus, 
            scheduled_at: scheduledAtValue, 
            dc_amount: finalFee 
        }]);
        
        if(error) throw error;
        
        closeOrderOverview();
        
        await Dialog.show("Success", "Your order has been placed successfully! ✅", "alert");
        window.location.href = "home.html";
        
    } catch (err) { 
        console.error("System Error: ", err);
        showInlineError("System Error", err.message || "Order place nahi ho saka.");
        
        btn.disabled = false; 
        btn.innerHTML = `Confirm & Place Order <i class="fas fa-check-circle ml-1"></i>`; 
        btn.classList.replace('bg-gray-400', 'bg-orange-600');
    }
}

// -----------------------------------------------------
// HYBRID DELIVERY FEE CALCULATION ENGINE & UTILS
// -----------------------------------------------------
function normalizeString(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\s+/g, ''); 
}

function levenshtein(a, b) {
    const an = a.length, bn = b.length;
    const matrix = Array.from({ length: an + 1 }, () => Array(bn + 1).fill(0));
    for (let i = 0; i <= an; i++) matrix[i][0] = i;
    for (let j = 0; j <= bn; j++) matrix[0][j] = j;
    for (let i = 1; i <= an; i++) {
        for (let j = 1; j <= bn; j++) {
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return matrix[an][bn];
}

async function getFinalDeliveryFee(cityName, areaName, userInputBlock, addressText = "") {
    const cleanCity = (cityName || "").trim();
    const cleanArea = (areaName || "").trim();

    // Customer override profile fee verification check
    if (customerId && !isNaN(customerId) && typeof userPhone !== 'undefined' && userPhone) {
        try {
            const { data: cust } = await _supabase
                .from('customers')
                .select('custom_delivery_fee')
                .eq('customer_id', customerId)
                .maybeSingle();
            if (cust && cust.custom_delivery_fee !== null && cust.custom_delivery_fee > 0) {
                console.log("🎯 Customer-specific delivery fee applied:", cust.custom_delivery_fee);
                return Number(cust.custom_delivery_fee);
            }
        } catch (e) {
            console.warn("Customer override fetch failed, falling back.", e);
        }
    }

    const cleanText = (text) => (text || "").trim()
        .replace(/[^a-zA-Z\s]/g, ' ')
        .replace(/\bblock\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const cleanBlockInput = cleanText(userInputBlock);
    const cleanAddress = cleanText(addressText);
    matchedBlockName = null;

    console.log("🔍 Fee lookup:", { cleanCity, cleanArea, blockInput: cleanBlockInput, address: cleanAddress });

    try {
        const { data: blocks, error: blockError } = await _supabase
            .from('delivery_blocks')
            .select('block_name, delivery_fee')
            .ilike('area_name', cleanArea);

        if (blockError) console.error("Block fetch error:", blockError);

        if (blocks && blocks.length > 0) {
            const allBlocks = blocks
                .map(b => ({
                    original: b.block_name.trim(),
                    tokens: (b.block_name || "").trim().toLowerCase().replace(/\bblock\b/gi, '').trim().split(/\s+/).filter(t => t.length > 0),
                    fee: Number(b.delivery_fee) || 0
                }))
                .filter(b => b.fee > 0) 
                .sort((a, b) => b.tokens.length - a.tokens.length);

            function normalizeToken(t) {
                if (!t) return '';
                let nt = t.toLowerCase();
                nt = nt.replace(/ee/g, 'i');
                nt = nt.replace(/oo/g, 'u');
                return nt;
            }

            const findBlock = (text, allowSingleLetters = true) => {
                if (!text) return null;
                const inputTokens = text.split(/\s+/).filter(t => t.length > 0);
                const normalizedInput = inputTokens.map(normalizeToken);

                for (const block of allBlocks) {
                    if (!allowSingleLetters && block.tokens.length === 1 && block.tokens[0].length === 1) continue;

                    const normalizedBlock = block.tokens.map(normalizeToken);

                    if (normalizedBlock.every(bt => normalizedInput.includes(bt))) {
                        return block;
                    }

                    if (block.tokens.every(bt => {
                        return inputTokens.some(it => {
                            if (it === bt) return true;
                            if (bt.length >= 4 && it.length >= 4 && levenshtein(bt, it) <= 1) return true;
                            return false;
                        });
                    })) {
                        return block;
                    }
                }
                return null;
            };

            if (cleanBlockInput) {
                const match = findBlock(cleanBlockInput, true);
                if (match) {
                    matchedBlockName = match.original;   
                    console.log("✅ Block matched from input:", match.original, match.fee);
                    return match.fee;
                }
            }
            if (cleanAddress) {
                const match = findBlock(cleanAddress, false);
                if (match) {
                    matchedBlockName = match.original;   
                    console.log("✅ Block detected from address:", match.original, match.fee);
                    return match.fee;
                }
            }

            console.warn("⚠️ No block matched. Falling back to area fee.");
        }

        const { data: areaData, error: areaError } = await _supabase
            .from('delivery_areas')
            .select('customer_delivery_fee')
            .ilike('city', cleanCity)
            .ilike('area_name', cleanArea)
            .maybeSingle();

        if (!areaError && areaData) {
            const fee = Number(areaData.customer_delivery_fee) || 0;
            console.log("🏠 Area fee fallback:", fee);
            return fee;
        }

        return 0;
    } catch (err) {
        console.error("Fee calculation error:", err);
        return 0;
    }
}
