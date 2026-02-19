import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import twilio from 'twilio';
import OpenAI from 'openai';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, '../app/dist')));

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Mock properties database (in production, use PostgreSQL)
const properties = [
  {
    id: '1',
    title: 'Dúplex moderno en Villa Morra',
    description: 'Hermoso dúplex de 3 dormitorios en zona exclusiva',
    price: 750,
    currency: 'USD',
    type: 'alquiler',
    propertyType: 'duplex',
    neighborhood: 'Villa Morra',
    city: 'Asunción',
    bedrooms: 3,
    bathrooms: 2,
    area: 180,
    images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'],
    amenities: ['Jardín privado', 'Cochera', 'Seguridad 24h'],
    contact: { name: 'María González', phone: '+595 981 234 567', whatsapp: '+595 981 234 567' },
  },
  {
    id: '2',
    title: 'Departamento céntrico',
    description: 'Moderno departamento de 2 dormitorios en el centro',
    price: 450,
    currency: 'USD',
    type: 'alquiler',
    propertyType: 'departamento',
    neighborhood: 'Centro',
    city: 'Asunción',
    bedrooms: 2,
    bathrooms: 1,
    area: 85,
    images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800'],
    amenities: ['Ascensor', 'Balcón'],
    contact: { name: 'Carlos Rodríguez', phone: '+595 982 345 678', whatsapp: '+595 982 345 678' },
  },
  {
    id: '3',
    title: 'Casa familiar en Luque',
    description: 'Espaciosa casa de 4 dormitorios con piscina',
    price: 950,
    currency: 'USD',
    type: 'alquiler',
    propertyType: 'casa',
    neighborhood: 'Residencial',
    city: 'Luque',
    bedrooms: 4,
    bathrooms: 3,
    area: 320,
    images: ['https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'],
    amenities: ['Piscina', 'Patio amplio', 'Cochera doble'],
    contact: { name: 'Ana Martínez', phone: '+595 983 456 789', whatsapp: '+595 983 456 789' },
  },
  {
    id: '4',
    title: 'Oficina en World Trade Center',
    description: 'Moderna oficina amueblada con vista panorámica',
    price: 600,
    currency: 'USD',
    type: 'alquiler',
    propertyType: 'oficina',
    neighborhood: 'World Trade Center',
    city: 'Asunción',
    bedrooms: 0,
    bathrooms: 1,
    area: 50,
    images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800'],
    amenities: ['Amueblado', 'Sala de reuniones'],
    contact: { name: 'Pedro Benítez', phone: '+595 984 567 890', whatsapp: '+595 984 567 890' },
  },
  {
    id: '5',
    title: 'Terreno en San Bernardino',
    description: 'Excelente terreno de 1000m2 cerca del lago',
    price: 85000,
    currency: 'USD',
    type: 'venta',
    propertyType: 'terreno',
    neighborhood: 'San Bernardino',
    city: 'San Bernardino',
    bedrooms: 0,
    bathrooms: 0,
    area: 1000,
    images: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800'],
    amenities: ['Escritura', 'Acceso pavimentado'],
    contact: { name: 'Luisa Fernández', phone: '+595 985 678 901', whatsapp: '+595 985 678 901' },
  },
];

// Search properties based on criteria
function searchProperties(criteria) {
  return properties.filter(p => {
    if (criteria.tipo && p.type !== criteria.tipo) return false;
    if (criteria.tipoPropiedad && p.propertyType !== criteria.tipoPropiedad) return false;
    if (criteria.dormitorios && p.bedrooms < criteria.dormitorios) return false;
    if (criteria.precioMax && p.price > criteria.precioMax) return false;
    if (criteria.barrio && !p.neighborhood.toLowerCase().includes(criteria.barrio.toLowerCase())) return false;
    if (criteria.ciudad && !p.city.toLowerCase().includes(criteria.ciudad.toLowerCase())) return false;
    return true;
  });
}

// Extract search criteria using OpenAI
async function extractCriteriaWithAI(message) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente inmobiliario para Paraguay. Extrae los criterios de búsqueda del mensaje.
Responde SOLO con un objeto JSON:
{
  "tipo": "venta" | "alquiler" | null,
  "tipoPropiedad": "casa" | "departamento" | "duplex" | "terreno" | "local" | "oficina" | null,
  "dormitorios": number | null,
  "precioMax": number | null,
  "barrio": string | null,
  "ciudad": string | null
}`
        },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('OpenAI error:', error);
    return parseCriteriaLocally(message);
  }
}

// Local criteria parsing as fallback
function parseCriteriaLocally(message) {
  const lowerMsg = message.toLowerCase();
  const criteria = {};

  if (lowerMsg.includes('alquil') || lowerMsg.includes('renta')) criteria.tipo = 'alquiler';
  else if (lowerMsg.includes('compr') || lowerMsg.includes('venta')) criteria.tipo = 'venta';

  const propertyTypes = [
    { key: ['casa'], value: 'casa' },
    { key: ['departamento', 'depto'], value: 'departamento' },
    { key: ['duplex'], value: 'duplex' },
    { key: ['terreno', 'lote'], value: 'terreno' },
    { key: ['local'], value: 'local' },
    { key: ['oficina'], value: 'oficina' },
  ];

  for (const pt of propertyTypes) {
    if (pt.key.some(k => lowerMsg.includes(k))) {
      criteria.tipoPropiedad = pt.value;
      break;
    }
  }

  const bedroomMatch = lowerMsg.match(/(\d+)\s*(?:dorm|habitacion)/);
  if (bedroomMatch) criteria.dormitorios = parseInt(bedroomMatch[1]);

  const priceMatch = lowerMsg.match(/(?:hasta|maximo)?\s*(?:USD\s*)?(\d+)/);
  if (priceMatch) criteria.precioMax = parseInt(priceMatch[1]);

  const locations = ['villa morra', 'centro', 'recoleta', 'las carmelitas', 'luque', 'lambaré', 'san bernardino'];
  for (const location of locations) {
    if (lowerMsg.includes(location)) {
      criteria.barrio = location.charAt(0).toUpperCase() + location.slice(1);
      break;
    }
  }

  return criteria;
}

// Generate AI response
async function generateAIResponse(message, criteria, results) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente inmobiliario amigable de PropiedadesPY Paraguay. Responde de forma breve y natural para WhatsApp (máximo 2-3 oraciones).`
        },
        {
          role: 'user',
          content: `Usuario: "${message}"\n\nEncontré ${results.length} propiedades. ${results.length > 0 ? 'Primeras: ' + results.slice(0, 2).map(p => `${p.title} - USD ${p.price}`).join(', ') : ''}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return completion.choices[0]?.message?.content || '¡Hola! Encontré algunas opciones para ti.';
  } catch (error) {
    if (results.length === 0) return 'Lo siento, no encontré propiedades con esos criterios. ¿Puedo ayudarte con otra búsqueda?';
    return `¡Perfecto! Encontré ${results.length} propiedades que coinciden. Te muestro las mejores opciones:`;
  }
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
  });
});

// Get all properties
app.get('/api/properties', (req, res) => {
  res.json(properties);
});

// Send WhatsApp message
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required fields: to, message' });
    }

    const result = await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
    });

    res.json({ 
      success: true, 
      messageSid: result.sid,
      status: result.status 
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ 
      error: 'Failed to send message', 
      details: error.message 
    });
  }
});

// Process message with AI
app.post('/api/ai/process', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }

    const criteria = await extractCriteriaWithAI(message);
    const results = searchProperties(criteria);
    const aiMessage = await generateAIResponse(message, criteria, results);

    res.json({
      message: aiMessage,
      criteria,
      properties: results.slice(0, 3),
    });
  } catch (error) {
    console.error('AI processing error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

// ============ TWILIO WEBHOOK ============

// // Receive incoming WhatsApp messages - RESPUESTA RÁPIDA
a// Almacenar estado de conversación (simple, en memoria)
const conversations = new Map();

// Receive incoming WhatsApp messages
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From, ProfileName } = req.body;
  
  console.log('Incoming WhatsApp message:', {
    from: From,
    body: Body,
    profileName: ProfileName,
  });

  // Responder inmediatamente
  res.status(200).send('OK');

  try {
    const lowerBody = Body.toLowerCase();
    
    // Obtener o crear estado de conversación
    if (!conversations.has(From)) {
      conversations.set(From, { step: 'start', data: {} });
    }
    const conv = conversations.get(From);

    // Mensaje inicial o "hola"
    if (lowerBody.includes('hola') || lowerBody.includes('buenas') || conv.step === 'start') {
      await sendWhatsAppMessage(From, 
        '¡Hola! 👋 Soy el asistente de APE Inmobiliaria.\n\n' +
        'Para ayudarte mejor, dime:\n\n' +
        '1️⃣ ¿Buscas comprar o alquilar?\n' +
        '2️⃣ ¿Qué tipo de propiedad? (casa, departamento, dúplex, terreno, oficina)\n' +
        '3️⃣ ¿En qué zona/barrio?\n' +
        '4️⃣ ¿Cuántos dormitorios necesitas?\n' +
        '5️⃣ ¿Presupuesto máximo?\n\n' +
        'O escribe todo junto: "Quiero alquilar un departamento en Villa Morra de 2 dormitorios hasta 600 USD"'
      );
      conv.step = 'waiting_info';
      return;
    }

    // Si ya tenemos info o el usuario escribió una búsqueda completa
    await sendWhatsAppMessage(From, '⏳ Buscando propiedades para ti...');

    // Extraer criterios
    const criteria = await extractCriteriaWithAI(Body);
    
    // Verificar si tenemos criterios mínimos
    if (!criteria.tipo && !criteria.tipoPropiedad && !criteria.barrio) {
      await sendWhatsAppMessage(From,
        'Necesito un poco más de información para ayudarte. Por ejemplo:\n\n' +
        '• "Quiero alquilar"\n' +
        '• "Busco una casa en Luque"\n' +
        '• "Departamento 2 dormitorios hasta 500 USD"\n\n' +
        '¿Qué estás buscando?'
      );
      return;
    }

    // Buscar propiedades
    const results = searchProperties(criteria);
    
    if (results.length === 0) {
      await sendWhatsAppMessage(From,
        'No encontré propiedades con esos criterios. 😕\n\n' +
        '¿Puedes ajustar tu búsqueda? Por ejemplo:\n' +
        '• Cambiar el rango de precio\n' +
        '• Otra zona o barrio\n' +
        '• Otro tipo de propiedad'
      );
      return;
    }

    // Mostrar resultados (máximo 3)
    let responseMessage = `¡Encontré ${results.length} propiedad${results.length > 1 ? 'es' : ''}! Aquí las mejores opciones:\n\n`;
    
    results.slice(0, 3).forEach((p, i) => {
      responseMessage += `${i + 1}. ${p.title}\n`;
      responseMessage += `   💰 USD ${p.price.toLocaleString()}${p.type === 'alquiler' ? '/mes' : ''}\n`;
      responseMessage += `   📍 ${p.neighborhood}, ${p.city}\n`;
      responseMessage += `   🏠 ${p.bedrooms} dorm, ${p.area}m²\n\n`;
    });
    
    responseMessage += '¿Te interesa alguna? Responde con el número (1, 2 o 3) para más detalles, o dime si quieres ver otras opciones.';

    await sendWhatsAppMessage(From, responseMessage);
    
    // Resetear conversación
    conversations.delete(From);

  } catch (error) {
    console.error('Error:', error);
    await sendWhatsAppMessage(From, 'Lo siento, hubo un error. Por favor intenta de nuevo.');
  }
});

// Función helper para enviar mensajes
async function sendWhatsAppMessage(to, body) {
  await twilioClient.messages.create({
    body: body,
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: to,
  });
}

// ============ FRONTEND SERVING ============

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../app/dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           🏠 PropiedadesPY Backend Server                  ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port: ${PORT}                            ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
╠════════════════════════════════════════════════════════════╣
║  Configured Services:                                      ║
║  • Twilio: ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '❌'}                                    ║
║  • OpenAI: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}                                    ║
╚════════════════════════════════════════════════════════════╝
  `);
});
