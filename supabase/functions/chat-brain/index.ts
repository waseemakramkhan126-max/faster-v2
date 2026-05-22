import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@latest"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Frontend se message, history, base64 fileData aur mimeType receive karna
    const { message, history, fileData, mimeType } = await req.json()
    const API_KEY = Deno.env.get("GEMINI_API_KEY"); 
    
    if (!API_KEY) {
       throw new Error("API Key set nahi hai!")
    }

    const genAI = new GoogleGenerativeAI(API_KEY)
    
    // Master Prompt (Exact same strict rules)
    const systemPrompt = `Tum ek expert aur professional 'Universal Order Taker' ho. 
    Tumhara kaam in categories ke orders smoothly lena hai: Restaurant, Groceries, Medicine, Tandoor, Cosmetics, aur Parcels (Pick & Drop).
    
    Tumhare sakht (strict) asool:
    1. LANGUAGE MATCHING: Customer jis zabaan mein baat kare (Urdu, Roman Urdu, English, Pashto, Chinese, etc.), tumne usi zabaan mein natural, friendly, aur polite tareeqe se jawab dena hai.
    2. STEP-BY-STEP: Hamesha step-by-step baat karo. Ek waqt mein sirf ek ya do zaroori sawal poocho. Items ki detail (quantity, size, brand, ya parcel ka pickup/drop address) zaroor confirm karo. Tum images (menu, parchi) aur voice notes ko bhi parse kar sakte ho.
    3. CHARGES: Delivery charges ka hisaab hamesha clear rakho: Normal delivery (Food, Grocery, Medicine, Cosmetics) Rs. 150 hai. Parcel (Pick/Drop) ke liye distance aur wazan ke hisaab se Rs. 200 se Rs. 300 tak estimate batao.
    4. ORDER SUMMARY (ROMAN URDU ONLY): Jab user order complete karne ka ishara de (jaise bole "bas", "done", "aur kuch nahi"):
       - Fauran ek mukammal aur saaf 'Order Summary' dikhao jis mein Items ki list, Delivery Charges, aur Total Estimated Bill shamil ho.
       - ZAROORI: Bhalay customer kisi bhi zabaan mein baat kar raha ho, final summary HAMESHA sirf aur sirf 'Simple Roman Urdu' mein banani hai (taake humara system isay asani se save kar sake).
    5. CONFIRMATION: Summary ke aakhir mein strictly ye kaho: "Aapka order bilkul ready hai. Baraye meharbani ab neeche maujood 'Confirm Order' button ko press karein taake hum aapki delivery start kar sakein."
    6. POST-CONFIRMATION: Agar user confirm karne ke baad (ya order summary banne ke baad) koi aisi baat kare jo naya item add karne ki na ho, toh usi ki zabaan mein strictly kaho: "Aapka order process ho raha hai, mazeed maloomat ke liye baraye meharbani app se apna live status check karein."`;

    const modelsPriorityList = [
      "gemini-2.5-flash",                  
      "gemini-2.0-flash",                  
      "gemini-2.0-flash-thinking-exp",     
      "gemini-2.0-flash-lite",             
      "gemini-1.5-flash",                  
      "gemini-1.5-pro"                     
    ];

    let aiResponse = null;
    let finalModelUsed = "";
    let lastError = null;

    const chatHistory = history ? history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    })) : [];

    // Multimodal Parts Array construct karna
    const contentParts = [];
    if (message) {
      contentParts.push({ text: message });
    }
    if (fileData && mimeType) {
      contentParts.push({
        inlineData: {
          data: fileData,  // Base64 Data
          mimeType: mimeType // e.g., 'image/jpeg' ya 'audio/webm'
        }
      });
    }

    for (const modelName of modelsPriorityList) {
      try {
        console.log(`Trying model: ${modelName}...`);
        
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemPrompt
        });

        const chat = model.startChat({ history: chatHistory });
        
        // Single text ke bajaye ab contentParts bheje ja rahe hain
        const result = await chat.sendMessage(contentParts);
        
        aiResponse = result.response.text();
        finalModelUsed = modelName;
        
        console.log(`Success! Response generated using: ${modelName}`);
        break; 

      } catch (err: any) {
        console.error(`Model ${modelName} failed. Error: ${err.message}`);
        lastError = err; 
        continue; 
      }
    }

    if (!aiResponse) {
      throw new Error(`Sare Gemini models ki limit khatam ho chuki hai. Last error: ${lastError?.message}`);
    }

    return new Response(JSON.stringify({ 
      reply: aiResponse,
      engine_info: { model_used: finalModelUsed } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
