// =============================================
// ai-logic.js – AI Functions
// =============================================

// یہ فنکشن AI کا جواب چيٹ میں دکھاتا ہے
function addAiBubble(text) {
    const chat = document.getElementById('chatArea');
    const bId = "ai-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    b.className = "bubble ai-bubble animate-pop bg-gray-100 text-gray-800 p-3 rounded-lg my-2 max-w-[80%] self-start"; 
    b.id = bId;
    b.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <div class="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">
                <i class="fas fa-robot"></i>
            </div>
            <strong class="text-xs text-orange-600">Faster AI</strong>
        </div>
        <p class="whitespace-pre-wrap">${text}</p>
    `;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight; 
}

// فائل کو Base64 میں بدل کر AI کو بھیجنا
function sendMediaToAI(file, promptText) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const base64String = reader.result.split(',')[1];
        const mimeType = file.type;
        await getAiReply(promptText, base64String, mimeType);
    };
    reader.onerror = error => {
        console.error("File reading error:", error);
        Dialog.show("Error", "File read nahi ho saki.", "alert");
    };
}

// Supabase Edge Function 'chat-brain' کو کال کرنے والا مرکزی فنکشن
async function getAiReply(userMessage, fileData = null, mimeType = null) {
    const btn = document.getElementById('sendBtn'); 
    const confirmBtn = document.getElementById('finalSubmitBtn'); 
    let originalContent = "";

    // بٹن کو لوڈنگ حالت میں لانا
    if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        btn.disabled = true;
    }
    if (confirmBtn) {
        confirmBtn.classList.add('opacity-50', 'pointer-events-none');
        confirmBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Wait...`;
    }

    try {
        // چيٹ ہسٹری جمع کرنا
        const chatElements = document.querySelectorAll('#chatArea .bubble');
        let rawHistory = [];
        chatElements.forEach(el => {
            const text = el.innerText.trim();
            if (text && !text.includes("⚠️")) { 
                if (el.classList.contains('ai-bubble')) {
                    let cleanText = text.replace(/Faster AI:/i, "").trim();
                    rawHistory.push({ role: 'model', content: cleanText });
                } else if (el.classList.contains('customer-bubble')) {
                    rawHistory.push({ role: 'user', content: text });
                }
            }
        });

        if (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].content === userMessage) {
            rawHistory.pop();
        }

        let safeHistory = [];
        let expectedRole = 'user';
        for (let msg of rawHistory) {
            if (msg.role === expectedRole) {
                safeHistory.push(msg);
                expectedRole = (expectedRole === 'user') ? 'model' : 'user';
            } else if (safeHistory.length > 0) {
                safeHistory[safeHistory.length - 1].content += " | " + msg.content;
            }
        }

        if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role === 'user') {
            let lastUserMsg = safeHistory.pop();
            userMessage = lastUserMsg.content + " | " + userMessage;
        }

        // AI کو ہدایات (System Instruction)
        const systemInstruction = `You are a professional order taker. 
        Current stage: Drafting/Updating Order.
        - ALWAYS update the order summary if the user adds new items (e.g., "Shimla add karein").
        - NEVER say "Order process ho raha hai" or "Live status check karein" unless the user explicitly confirms. Keep the customer in the order flow.`;

        // Edge Function کو کال
        const { data, error } = await _supabase.functions.invoke('chat-brain', {
            body: { message: userMessage, history: safeHistory, fileData: fileData, mimeType: mimeType, systemInstruction: systemInstruction }
        });

        // ايرر ہینڈلنگ
        let hasError = false;
        let errorMsg = "";
        if (error) { hasError = true; errorMsg = error.message || error.toString(); }
        if (data && data.error) { hasError = true; errorMsg = data.error; }

        if (hasError) {
            let lowerError = errorMsg.toLowerCase();
            if (lowerError.includes("limit") || lowerError.includes("quota") || lowerError.includes("exceeded") || lowerError.includes("429")) {
                Dialog.show("Limit Reached", "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", "alert");
            } else {
                addAiBubble(`⚠️ System Error: ${errorMsg}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
            }
            return; 
        }

        if (data && data.reply) {
            addAiBubble(data.reply);

            // خودکار کنفرم پاپ اپ (اگر صارف نے "ok", "done" وغیرہ کہا ہو)
            const confirmRegex = /\b(ok|oky|okay|okie|okei|ok\s*g|oky\s*g|okay\s*g|okie\s*g|okei\s*g|done|confirm|theek|theek\s*hai|theek\s*hai\s*g|thk|proceed|process)\b/i;
            let userLatestText = userMessage.split("|").pop().trim().toLowerCase();
            if (confirmRegex.test(userLatestText)) {
                setTimeout(() => { handleConfirmPrompt(); }, 1000);
            }
        }

    } catch(err) {
        console.error("AI Error:", err);
        if (err.message.toLowerCase().includes("limit") || err.message.toLowerCase().includes("quota")) {
            Dialog.show("Limit Reached", "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", "alert");
        } else {
            addAiBubble(`⚠️ System Error: ${err.message}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
        }
    } finally {
        // بٹن بحال کرنا
        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        if (confirmBtn) {
            confirmBtn.innerHTML = `Confirm order <i class="fas fa-arrow-right ml-1 text-sm"></i>`;
            confirmBtn.classList.remove('opacity-50', 'pointer-events-none');
            confirmBtn.disabled = false; 
        }
    }
}
