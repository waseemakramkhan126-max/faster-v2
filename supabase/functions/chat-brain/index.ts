import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@latest"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS Preflight request ko handle karna
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Frontend se naya message aur purani chat history le rahe hain
    const { message, history } = await req.json()
    
    // NAYA: API Key ko direct likhne ke bajaye Supabase ke secrets (environment variable) se get karna
    const API_KEY = Deno.env.get("GEMINI_API_KEY"); 
    
    if (!API_KEY) {
       throw new Error("API Key set nahi hai! Baraye meharbani 'supabase secrets set GEMINI_API_KEY=...' command chalayen.")
    }

    const genAI = new GoogleGenerativeAI(API_KEY)
    
    // ==========================================
    // AI KA MASTER PROMPT (MERGED RULES) - Exact same as requested
    // ==========================================
    const systemPrompt = `Tum ek expert aur professional 'Universal Order Taker' ho. 
    Tumhara kaam in categories ke orders smoothly lena hai: Restaurant, Groceries, Medicine, Tandoor, Cosmetics, aur Parcels (Pick & Drop).
    
    Tumhare sakht (strict) asool:
    1. LANGUAGE MATCHING: Customer jis zabaan mein baat kare (Urdu, Roman Urdu, English, Pashto, Chinese, etc.), tumne usi zabaan mein natural, friendly, aur polite tareeqe se jawab dena hai.
    2. STEP-BY-STEP: Hamesha step-by-step baat karo. Ek waqt mein sirf ek ya do zaroori sawal poocho. Items ki detail (quantity, size, brand, ya parcel ka pickup/drop address) zaroor confirm karo.
    3. CHARGES: Delivery charges ka hisaab hamesha clear rakho: Normal delivery (Food, Grocery, Medicine, Cosmetics) Rs. 150 hai. Parcel (Pick/Drop) ke liye distance aur wazan ke hisaab se Rs. 200 se Rs. 300 tak estimate batao.
    4. ORDER SUMMARY (ROMAN URDU ONLY): Jab user order complete karne ka ishara de (jaise bole "bas", "done", "aur kuch nahi"):
       - Fauran ek mukammal aur saaf 'Order Summary' dikhao jis mein Items ki list, Delivery Charges, aur Total Estimated Bill shamil ho.
       - ZAROORI: Bhalay customer kisi bhi zabaan mein baat kar raha ho, final summary HAMESHA sirf aur sirf 'Simple Roman Urdu' mein banani hai (taake humara system isay asani se save kar sake).
    5. CONFIRMATION: Summary ke aakhir mein strictly ye kaho: "Aapka order bilkul ready hai. Baraye meharbani ab neeche maujood 'Confirm Order' button ko press karein taake hum aapki delivery start kar sakein."
    6. POST-CONFIRMATION: Agar user confirm karne ke baad (ya order summary banne ke baad) koi aisi baat kare jo naya item add karne ki na ho, toh usi ki zabaan mein strictly kaho: "Aapka order process ho raha hai, mazeed maloomat ke liye baraye meharbani app se apna live status check karein."`;

    // NAYA: systemInstruction property ke zariye prompt ko model ke dimagh mein feed karna zaroori hai
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt
    });

    // Frontend ki history ko Google API ke format mein convert karna
    const chatHistory = history ? history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    })) : [];

    // History ke sath AI ki chat start karna (taake wo pichli baat yaad rakhe)
    const chat = model.startChat({ history: chatHistory })

    // User ka naya message send karna
    const result = await chat.sendMessage(message)
    const aiResponse = result.response.text()

    // AI ka jawab frontend ko wapis bhejna
    return new Response(JSON.stringify({ reply: aiResponse }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    // Agar koi crash ho toh proper error wapis aaye
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})