import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@latest"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 1. Supabase Client Setup
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// 2. Human Delay Calculation Logic
function calculateHumanDelay(message: string) {
  const wordCount = message.trim().split(/\s+/).length
  const charCount = message.length

  const baseSeenDelay = 1500
  const randomSeenExtra = Math.floor(Math.random() * 2000) 
  const seenDelay = baseSeenDelay + randomSeenExtra

  let calculatedTyping = charCount * 180
  if (calculatedTyping < 2000) calculatedTyping = 2000
  if (calculatedTyping > 8000) calculatedTyping = 8000

  const typingDuration = calculatedTyping + Math.floor(Math.random() * 1000)

  return { seenDelay, typingDuration }
}

// 3. Customer Memory Manager
async function getCustomerMemory(phone: string) {
  try {
    const { data: memory, error } = await supabase
      .from('ai_customer_memory')
      .select('*')
      .eq('customer_phone', phone)
      .single()

    if (error || !memory) {
      const { data: customer } = await supabase
        .from('customers')
        .select('name, address, city, area')
        .eq('phone', phone)
        .single()

      const defaultMemory = {
        customer_phone: phone,
        preferred_language: 'Roman',
        spam_score: 0,
        is_vip: false,
        favourite_items: {},
        favourite_locations: customer ? { address: customer.address, city: customer.city } : {}
      }

      await supabase.from('ai_customer_memory').insert([defaultMemory])
      return defaultMemory
    }

    return memory
  } catch (err) {
    console.warn("Memory fetch karne mein masla aaya:", err)
    return { preferred_language: 'Roman', is_vip: false }
  }
}

// 4. Task Queue Handler
async function enqueueTask(taskType: string, payload: any) {
  try {
    const { error } = await supabase
      .from('ai_task_queue')
      .insert([{ task_type: taskType, payload: payload, status: 'pending' }])

    if (error) {
      console.error("Task queue error:", error.message)
      return false
    }
    return true
  } catch (err: any) {
    console.error("Task queue exception:", err.message)
    return false
  }
}

// 5. AI Brain & Decision Engine
async function getAIResponseAndAction(message: string, history: any[], memory: any, fileData?: string, mimeType?: string) {
  const API_KEY = Deno.env.get("GEMINI_API_KEY")
  if (!API_KEY) throw new Error("Gemini API Key set nahi hai!")

  const genAI = new GoogleGenerativeAI(API_KEY)

  const systemPrompt = `Tum ek professional aur intelligent AI Employee ho jo ek delivery aur ordering system ko manage karta hai.
Customer ki language: ${memory.preferred_language || 'Roman Urdu'}
Customer VIP status: ${memory.is_vip ? 'VIP Customer' : 'Normal Customer'}

RULES:
1. Hamesha customer ki language (Roman Urdu/Urdu) mein natural aur polite jawab do.
2. Order parsing karte waqt bohot dhyan rakho: Agar customer mixed items ya casual quantity likhe (e.g. "1kg aloo aur 2 anday"), toh kisi bhi product field ya data ko miss mat karo. Har item ko uski exact quantity ke sath map karo.
3. Step-by-step sawal poocho (quantity, delivery address, confirmation).
4. Jab order ki sari details confirm ho jayein, toh aakhir mein clear order summary do aur customer ko "Confirm Order" karne ko kaho.
5. Agar order fully confirm ho chuka ho, to apne JSON response mein action ko 'CREATE_ORDER' set karo. Warna 'NONE' rakho.

IMPORTANT: Tumhe apna jawab hamesha ek valid JSON format mein dena hai, jiska structure yeh ho:
{
  "replyText": "Yahan customer ke liye aap ka jawab hoga...",
  "action": "NONE" ya "CREATE_ORDER",
  "orderData": {
    "items": "...",
    "total_amount": 0
  }
}`

  const modelsPriorityList = [
    "gemini-1.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash"
  ]

  let aiRawResponse = null
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

  for (const modelName of modelsPriorityList) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt })
      const chat = model.startChat({ history: chatHistory })

      const result = await Promise.race([
        chat.sendMessage(contentParts),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 12000))
      ]) as any

      aiRawResponse = result.response.text()
      finalModelUsed = modelName
      break
    } catch (err: any) {
      console.warn(`⚠️ Model ${modelName} fail ho gaya: ${err.message}`)
      continue
    }
  }

  if (!aiRawResponse) {
    throw new Error("Tamam AI models fail ho gaye ya timeout ho gaya.")
  }

  try {
    const cleanedJsonString = aiRawResponse.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsedData = JSON.parse(cleanedJsonString)
    
    return {
      replyText: parsedData.replyText || "Ji, main samajh gaya hoon. Batayen mazeed kya help chahiye?",
      action: parsedData.action || 'NONE',
      orderData: parsedData.orderData || {},
      engineInfo: { model_used: finalModelUsed }
    }
  } catch (parseError) {
    return {
      replyText: aiRawResponse,
      action: 'NONE',
      orderData: {},
      engineInfo: { model_used: finalModelUsed }
    }
  }
}

// 6. Main Server Handler (CEO)
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, message, history, fileData, mimeType } = await req.json()
    
    if (!phone || !message) {
      throw new Error("Phone number aur message dono zaroori hain!")
    }

    const { seenDelay, typingDuration } = calculateHumanDelay(message)
    const memory = await getCustomerMemory(phone)
    const aiDecision = await getAIResponseAndAction(message, history, memory, fileData, mimeType)

    if (aiDecision.action === 'CREATE_ORDER') {
       await enqueueTask('create_order', { phone: phone, order_details: aiDecision.orderData })
    } 
    else if (aiDecision.action === 'UPDATE_PROFILE') {
       await enqueueTask('update_profile', { phone: phone, profile_data: aiDecision.orderData })
    }

    return new Response(JSON.stringify({
      reply: aiDecision.replyText,
      delay_config: {
          seen_wait_ms: seenDelay,
          typing_duration_ms: typingDuration
      },
      action_taken: aiDecision.action,
      engine_info: aiDecision.engineInfo
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
