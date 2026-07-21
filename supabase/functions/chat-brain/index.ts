import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@latest"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, history, fileData, mimeType } = await req.json()
    const API_KEY = Deno.env.get("GEMINI_API_KEY")
    if (!API_KEY) throw new Error("API Key set nahi hai!")

    const genAI = new GoogleGenerativeAI(API_KEY)

    // ✅ 1. SHORT & CRISP SYSTEM PROMPT (سرعت کے لیے مختصر)
    const systemPrompt = `Tum Universal Order Taker ho.
1. User ki zabaan mein jawab do.
2. Step-by-step sawal poocho (quantity, brand, address confirm karo).
3. Delivery charges clear karo (Normal Rs.150, Parcel Rs.200-300).
4. Summary Roman Urdu mein do aur "Confirm Order" button press karne ko kaho.
5. Confirm ke baad "Order process ho raha hai" kaho.`

    // ✅ 2. FASTEST MODELS FIRST (سپیڈ آرڈر)
    const modelsPriorityList = [
      "gemini-1.5-flash",        // سب سے تیز اور ہلکا
      "gemini-2.0-flash-lite",   // بہت تیز اور سستا
      "gemini-2.0-flash",        // متوازن
      "gemini-2.5-flash"         // صرف اگر اوپر والے کام نہ کریں
    ]

    let aiResponse = null
    let finalModelUsed = ""

    const chatHistory = history ? history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    })) : []

    const contentParts = []
    if (message) contentParts.push({ text: message })
    if (fileData && mimeType) {
      contentParts.push({ inlineData: { data: fileData, mimeType: mimeType } })
    }

    // ✅ 3. TIMEOUT LOGIC (12 سیکنڈ کے بعد اگلا ماڈل آزمائیں)
    for (const modelName of modelsPriorityList) {
      try {
        console.log(`Trying model: ${modelName}...`)

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt
        })

        const chat = model.startChat({ history: chatHistory })

        // Promise race with 12-second timeout
        const result = await Promise.race([
          chat.sendMessage(contentParts),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), 12000)
          )
        ]) as any

        aiResponse = result.response.text()
        finalModelUsed = modelName
        console.log(`✅ Success! Used: ${modelName}`)
        break

      } catch (err: any) {
        console.warn(`⚠️ ${modelName} failed: ${err.message}`)
        continue
      }
    }

    if (!aiResponse) {
      throw new Error("All models failed or timeout. Quota exhausted?")
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
