// ==========================================
// 2. CUSTOM DIALOG / ALERTS UI
// ==========================================
const Dialog = {
    show: function(title, text, type = 'alert') {
        return new Promise((resolve) => {
            const modal = document.getElementById('customModal');
            const box = document.getElementById('modalBox');
            const tEl = document.getElementById('modalTitle');
            const textEl = document.getElementById('modalText');
            const inp = document.getElementById('modalInput');
            const btns = document.getElementById('modalButtons');

            tEl.innerText = title;
            if(text) { textEl.innerText = text; textEl.classList.remove('hidden'); } 
            else { textEl.classList.add('hidden'); }

            modal.classList.remove('hidden'); 
            modal.classList.add('flex');
            
            setTimeout(() => { 
                box.classList.remove('scale-95', 'opacity-0'); 
                box.classList.add('scale-100', 'opacity-100'); 
            }, 10);

            const close = (val) => {
                box.classList.remove('scale-100', 'opacity-100'); 
                box.classList.add('scale-95', 'opacity-0');
                setTimeout(() => { 
                    modal.classList.add('hidden'); 
                    modal.classList.remove('flex'); 
                    resolve(val); 
                }, 200);
            };

            btns.innerHTML = '';
            
            // UI COLOR CONTROL: Popup ke buttons ka color yahan se tabdeel hoga
            if (type === 'alert') {
                inp.classList.add('hidden');
                // 'bg-orange-500' ko badal kar popup ka "OK" button color change karein
                btns.innerHTML = `<button class="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm w-full">OK</button>`;
                btns.querySelector('button').onclick = () => close(true);
                
            } else if (type === 'confirm') {
                inp.classList.add('hidden');
                // 'bg-orange-500' confirm wale popup ke "Yes" button ke liye hai
                btns.innerHTML = `
                    <button class="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold text-sm flex-1">Cancel</button>
                    <button class="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex-1 shadow-md">Yes, Proceed</button>
                `;
                btns.querySelectorAll('button')[0].onclick = () => close(false); 
                btns.querySelectorAll('button')[1].onclick = () => close(true);
                
            } else if (type === 'prompt') {
                inp.classList.remove('hidden'); 
                inp.value = '';
                // Input maangne wale popup ke buttons
                btns.innerHTML = `
                    <button class="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold text-sm">Skip</button>
                    <button class="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex-1 shadow-md">Save</button>
                `;
                btns.querySelectorAll('button')[0].onclick = () => close(''); 
                btns.querySelectorAll('button')[1].onclick = () => close(inp.value.trim());
                setTimeout(() => inp.focus(), 150);
            }
        });
    }
};

// ==========================================
// CHAT BUBBLES & ATTACHMENTS LOGIC
// ==========================================
function toggleAttachMenu() {
    document.getElementById('attachMenu').classList.toggle('active');
    document.getElementById('plusIcon').classList.toggle('rotate-45');
    // UI COLOR CONTROL: Menu khulne par Plus icon ka color 'text-orange-500' ho jata hai
    document.getElementById('plusIcon').classList.toggle('text-orange-500');
}

function handleInput(el) {
    el.style.height = '44px'; 
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'; 
    const val = el.value.trim();
    document.getElementById('sendBtn').classList.toggle('hidden', val === "");
    document.getElementById('voiceBtn').classList.toggle('hidden', val !== "");
}

async function previewFile(input, mode) {
    if(!input.files || input.files.length === 0) return;
    for (const file of Array.from(input.files)) {
        const type = file.type.startsWith('video') ? 'video' : (mode === 'doc' ? 'doc' : 'image');
        if(type === 'image') {
            const caption = await Dialog.show("Add Caption", "Would you like to add a message with this picture? (Optional)", "prompt");
            addToDraft('image', { file: file, caption: caption || "" });
        } else { 
            addToDraft(type, file); 
        }
    }
    input.value = ""; 
}

function addToDraft(type, content) {
    document.getElementById('emptyPlaceholder').style.display = 'none';
    const chat = document.getElementById('chatArea');
    const bId = "b-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    
    // UI COLOR CONTROL: Yahan CSS file se 'customer-bubble' (halka sabz rang) lagta hai
    b.className = "bubble customer-bubble animate-pop"; 
    b.id = bId;

    let itemData = content;
    
    if (type === 'text') {
        const val = (typeof content === 'string') ? content : document.getElementById('orderInput').value.trim();
        if(!val) return; 
        itemData = val; 
        b.innerHTML = `<p class="whitespace-pre-wrap">${val}</p>`;
        
        if(typeof content !== 'string') { 
            document.getElementById('orderInput').value = ""; 
            handleInput(document.getElementById('orderInput')); 
        }
    } else if (type === 'image') {
        const imgUrl = URL.createObjectURL(content.file);
        // UI COLOR CONTROL: Image ke caption ka text color 'text-gray-800' yahan hai
        b.innerHTML = `
            <img src="${imgUrl}" class="media-thumb shadow-sm">
            ${content.caption ? `<div class="caption-text font-bold text-gray-800">${content.caption}</div>` : ''}
        `;
    } else if (type === 'video') {
        b.innerHTML = `<video src="${URL.createObjectURL(content)}" class="media-thumb shadow-sm" playsinline preload="metadata"></video>`;
    } else if (type === 'voice') {
        b.innerHTML = `
            <div class="flex items-center gap-1">
                <audio src="${URL.createObjectURL(content)}" controls class="h-8 w-44"></audio>
            </div>
        `;
    } else if (type === 'doc') {
        // UI COLOR CONTROL: Document (PDF/Word) ke icons ke colors yahan se control hote hain
        let iconClass = "fas fa-file text-gray-500"; // Default
        if(content.name.endsWith('.pdf')) iconClass = "fas fa-file-pdf text-red-500"; // PDF Red
        else if(content.name.match(/\.(doc|docx)$/)) iconClass = "fas fa-file-word text-blue-500"; // Word Blue
        
        b.innerHTML = `
            <div class="flex items-center gap-3 p-1 text-sm font-bold text-gray-700">
                <div class="bg-gray-100 p-3 rounded-lg"><i class="${iconClass} text-xl"></i></div>
                <div class="flex flex-col truncate w-32">
                    <span class="truncate">${content.name}</span>
                    <span class="text-[10px] text-gray-400 font-normal">${(content.size / 1024).toFixed(1)} KB</span>
                </div>
            </div>
        `;
    }

    let pressTimer;
    b.addEventListener('touchstart', (e) => { 
        pressTimer = setTimeout(() => { 
            toggleSelect(bId, type); 
            if(navigator.vibrate) navigator.vibrate(50); 
        }, 500); 
    });
    b.addEventListener('touchmove', () => clearTimeout(pressTimer)); 
    b.addEventListener('touchend', () => clearTimeout(pressTimer));
    
    b.addEventListener('click', () => {
        if (selectedItems.length > 0) { 
            toggleSelect(bId, type); 
        } else if (type === 'image' || type === 'video') {
            const src = type === 'image' ? URL.createObjectURL(content.file) : URL.createObjectURL(content);
            openFull({src: src}, type === 'image' ? 'img' : 'vid');
        }
    });

    const key = type === 'text' ? 'texts' : type + 's';
    draftData[key].push({ id: bId, data: itemData });
    chat.appendChild(b); 
    chat.scrollTop = chat.scrollHeight;
    document.getElementById('confirmBtnRow').classList.remove('hidden');
}

function toggleSelect(id, type) {
    const idx = selectedItems.findIndex(item => item.id === id);
    const el = document.getElementById(id);
    
    if (idx > -1) { 
        selectedItems.splice(idx, 1); 
        el.classList.remove('bubble-selected'); 
    } else { 
        selectedItems.push({ id, type }); 
        // UI COLOR CONTROL: Message select hone par class CSS file se lagti hai (halka green border)
        el.classList.add('bubble-selected'); 
    }

    if (selectedItems.length > 0) {
        document.getElementById('customerDetailsBox').classList.add('hidden');
        document.getElementById('selectionHeader').classList.remove('hidden');
        document.getElementById('selectionCount').innerText = selectedItems.length;
        
        const showEdit = (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'image'));
        document.getElementById('editIcon').classList.toggle('hidden', !showEdit);
    } else { 
        cancelSelection(); 
    }
}

function cancelSelection() {
    selectedItems.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) { el.classList.remove('bubble-selected'); }
    });
    selectedItems = [];
    document.getElementById('selectionHeader').classList.add('hidden');
    document.getElementById('customerDetailsBox').classList.remove('hidden');
}

function editSelected() {
    if(selectedItems.length !== 1) return;
    const sel = selectedItems[0];
    const inp = document.getElementById('orderInput');
    
    if(sel.type === 'text') { 
        inp.value = draftData.texts.find(t => t.id === sel.id).data; 
    } else if(sel.type === 'image') { 
        inp.value = draftData.images.find(i => i.id === sel.id).data.caption; 
    }
    
    confirmDelete(); 
    handleInput(inp); 
    inp.focus();
}

function confirmDelete() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(sel => {
        const key = sel.type === 'text' ? 'texts' : sel.type + 's';
        draftData[key] = draftData[key].filter(item => item.id !== sel.id);
        const el = document.getElementById(sel.id);
        if (el) { el.remove(); }
    });
    cancelSelection();
    if (Object.values(draftData).flat().length === 0) {
        document.getElementById('confirmBtnRow').classList.add('hidden');
        document.getElementById('emptyPlaceholder').style.display = 'flex';
    }
}

function openFull(el, type) {
    const fv = document.getElementById('fullView'); 
    fv.style.display = 'flex';
    if (type === 'img') {
        document.getElementById('fullContent').innerHTML = `<img src="${el.src}" class="max-w-full max-h-full rounded object-contain">`;
    } else {
        document.getElementById('fullContent').innerHTML = `<video src="${el.src}" controls autoplay playsinline class="max-w-full max-h-full rounded"></video>`;
    }
}
