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
    images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800 '],
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
    images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800 '],
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
    images: ['https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800 '],
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
    images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800 '],
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
    images: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800 '],
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
          content: `Eres Kape, el extractor de criterios de APE.

TU TRABAJO: Analizar el mensaje del usuario y extraer datos estructurados.

REGLAS IMPORTANTES:
- Responde SOLO con un objeto JSON válido
- NO agregues texto explicativo antes o después del JSON
- Si el usuario responde "1", interpretar: tipo = "alquiler"
- Si responde "2", interpretar: tipo = "venta"
- Si responde "3", interpretar: intencion = "vender"
- Si responde "4", interpretar: intencion = "contactar_agente"
- Para texto libre, extraer: QUE (tipoPropiedad), DONDE (barrio/ciudad), CUANTO (precioMax)

FORMATO DE RESPUESTA:
{
  "tipo": "venta" | "alquiler" | null,
  "tipoPropiedad": "casa" | "departamento" | "duplex" | "terreno" | "local" | "oficina" | null,
  "dormitorios": number | null,
  "precioMax": number | null,
  "barrio": string | null,
  "ciudad": string | null,
  "intencion": "buscar" | "vender" | "contactar_agente" | null
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
          content: `Eres Kape, el asistente inteligente de APE.

TU PERSONALIDAD:
- Amigable, directo y servicial. Un "kape" de verdad.
- Usas español natural: "depto", "vivienda", "zona", "cerca de".
- No eres robótico. Tienes calidez pero siempre profesional.

TU TRABAJO:
1. Ayudar a encontrar propiedades conectando con agentes e inmobiliarias aliadas.
2. Extraer: QUE (tipo), DONDE (zona), CUANTO (presupuesto).
3. Si falta algo, preguntas amablemente.
4. Presentas opciones reales de agentes verificados.

REGLAS:
- Firmas como "Kape" o "Tu Kape de APE".
- Nunca inventes propiedades.
- Respetas siempre a los agentes. Ellos son aliados, no competencia.`
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

// Almacenar quien ya saludo
const greetedUsers = new Set();

// Almacenar estado de conversación por usuario
const userSessions = new Map();

// ============ TWILIO WEBHOOK ============

app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From, ProfileName } = req.body;
  
  console.log('Incoming WhatsApp message:', {
    from: From,
    body: Body,
    profileName: ProfileName,
  });

  // 1. Responder INMEDIATAMENTE a Twilio (evita timeout)
  res.status(200).send('OK');

  // 2. Procesar en segundo plano (después de responder)
  try {
    const lowerBody = Body.toLowerCase().trim();
    
    // Obtener o crear sesión del usuario
    let session = userSessions.get(From) || { step: 'inicio', intencion: null, criterios: {}, moneda: 'USD' };
    
    // Detectar si es primera vez o saludo
    const esPrimeraVez = !greetedUsers.has(From);
    const esSaludo = lowerBody.includes('hola') || 
                     lowerBody.includes('buenas') || 
                     lowerBody.includes('hey') ||
                     lowerBody === 'kape' ||
                     lowerBody === 'holi';
    
    // Detectar si ya quiere buscar algo especifico
    const quiereBuscar = lowerBody.includes('casa') || 
                         lowerBody.includes('departamento') || 
                         lowerBody.includes('depto') || 
                         lowerBody.includes('duplex') || 
                         lowerBody.includes('dúplex') || 
                         lowerBody.includes('terreno') || 
                         lowerBody.includes('oficina') ||
                         lowerBody.includes('local') ||
                         lowerBody.includes('alquil') || 
                         lowerBody.includes('compr') ||
                         lowerBody.includes('busco') ||
                         lowerBody.includes('necesito') ||
                         lowerBody.includes('vendo') ||
                         lowerBody.includes('vender') ||
                         /^\d+$/.test(Body.trim()); // Numeros 1, 2, 3, 4
    
    // Si es primera vez o saludo, y NO quiere buscar todavia, mostrar menu
    if ((esPrimeraVez || esSaludo) && !quiereBuscar) {
      greetedUsers.add(From);
      session = { step: 'inicio', intencion: null, criterios: {}, moneda: 'USD' };
      userSessions.set(From, session);
      
      await twilioClient.messages.create({
        body: 'Hola, soy Kape. ¿Con que te ayudo?\n\n' +
              '1. Buscar propiedad para alquilar\n' +
              '2. Buscar propiedad para comprar\n' +
              '3. Vender mi propiedad\n' +
              '4. Hablar con un agente\n\n' +
              'Responde con el numero o escribime tu busqueda directamente.',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: From,
      });
      return;
    }
    
    // MANEJO DE OPCIONES DEL MENÚ
    if (Body.trim() === '1') {
      session.intencion = 'alquilar';
      session.step = 'preguntar_zona';
      userSessions.set(From, session);
      
      await twilioClient.messages.create({
        body: '¡Perfecto! Buscas para alquilar 🏠\n\nPrimero, ¿tenés una zona o barrio específico en mente?\n\nPodés decirme:\n• Un barrio (ej: Villa Morra, Centro, Luque)\n• Un punto de referencia (ej: cerca del Colegio XYZ, cerca de la oficina del Banco Central)\n• O escribime "cualquiera" si no tenés preferencia',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: From,
      });
      return;
    }
    
    if (Body.trim() === '2') {
      session.intencion = 'comprar';
      session.step = 'preguntar_zona';
      userSessions.set(From, session);
      
      await twilioClient.messages.create({
        body: '¡Excelente! Buscas para comprar 🏡\n\nPrimero, ¿tenés una zona o barrio específico en mente?\n\nPodés decirme:\n• Un barrio (ej: Villa Morra, Centro, Luque)\n• Un punto de referencia (ej: cerca del Colegio XYZ, cerca de la oficina del Banco Central)\n• O escribime "cualquiera" si no tenés preferencia',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: From,
      });
      return;
    }
    
    if (Body.trim() === '3') {
      session.intencion = 'vender';
      session.step = 'vender_datos';
      userSessions.set(From, session);
      
      await twilioClient.messages.create({
        body: '¡Genial! Querés vender tu propiedad 📍\n\nPara ayudarte mejor, contame:\n• ¿Qué tipo de propiedad es?\n• ¿En qué zona/barrio está?\n• ¿Cuántos dormitorios tiene?\n• ¿Precio aproximado?\n\nTe conectaré con un agente verificado.',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: From,
      });
      return;
    }
    
    if (Body.trim() === '4') {
      session.intencion = 'contactar_agente';
      session.step = 'contacto';
      userSessions.set(From, session);
      
      await twilioClient.messages.create({
        body: '¡Claro! Te conecto con un agente de APE 🤝\n\n¿Sobre qué necesitás hablar?\n• Ver una propiedad específica\n• Asesoramiento personalizado\n• Vender/alquilar mi propiedad\n• Otra consulta\n\nContame brevemente y te paso el contacto.',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: From,
      });
      return;
    }
    
    // FLUJO DE BÚSQUEDA CON DETALLES
    if (session.intencion === 'alquilar' || session.intencion === 'comprar') {
      
      // Paso 1: Preguntar ZONA (primera prioridad)
      if (session.step === 'preguntar_zona' && Body.trim().length > 0) {
        const zona = Body.trim();
        if (zona.toLowerCase() !== 'cualquiera' && zona.toLowerCase() !== 'no' && zona.toLowerCase() !== 'nop') {
          session.criterios.barrio = zona;
        }
        session.step = 'preguntar_presupuesto_si_no';
        userSessions.set(From, session);
        
        await twilioClient.messages.create({
          body: `¡${zona.toLowerCase() === 'cualquiera' || zona.toLowerCase() === 'no' ? 'Zona' : 'Zona ' + zona} anotada! ✓\n\n¿Tenés un presupuesto máximo definido?\n\nResponde:\n• SI → si tenés un monto en mente\n• NO → si querés ver opciones de todos los precios`,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: From,
        });
        return;
      }
      
      // Paso 2: Preguntar si tiene presupuesto (SI/NO)
      if (session.step === 'preguntar_presupuesto_si_no' && Body.trim().length > 0) {
        const respuesta = lowerBody;
        
        if (respuesta === 'si' || respuesta === 'sí' || respuesta === 'yes') {
          session.step = 'preguntar_monto';
          userSessions.set(From, session);
          
          await twilioClient.messages.create({
            body: '¡Perfecto! ¿Cuál es tu presupuesto máximo?\n\nPodés decirme:\n• En dólares: 500, 1000, 1500...\n• En guaraníes: 3 millones, 5.000.000, 3.500.000 gs...\n\nEscribime el monto.',
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: From,
          });
          return;
        } else {
          // No tiene presupuesto definido, saltar al tipo de propiedad
          session.criterios.precioMax = null;
          session.step = 'preguntar_tipo';
          userSessions.set(From, session);
          
          await twilioClient.messages.create({
            body: '¡Dale! Veo opciones de todos los precios ✓\n\n¿Tenés preferencia por algún tipo de propiedad?\n\n• Casa\n• Departamento\n• Dúplex\n• Local/Oficina\n• Terreno\n• O escribime "cualquiera"',
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: From,
          });
          return;
        }
      }
      
      // Paso 3: Preguntar MONTO del presupuesto
      if (session.step === 'preguntar_monto' && Body.trim().length > 0) {
        const montoTexto = Body.trim().toLowerCase();
        let precio = null;
        let esGuaranies = false;
        
        // Detectar si es guaraníes
        if (montoTexto.includes('millon') || montoTexto.includes('gs') || montoTexto.includes('guarani') || montoTexto.includes('₲')) {
          esGuaranies = true;
          session.moneda = 'GS';
          // Extraer número (puede ser 3, 3.5, 3,500,000, etc.)
          const numeroLimpio = montoTexto.replace(/[^0-9.,]/g, '').replace(',', '.');
          const numero = parseFloat(numeroLimpio);
          if (numero) {
            // Si es menor a 1000, asumimos que está en millones (ej: 3 = 3 millones)
            if (numero < 1000) {
              precio = numero * 1000000;
            } else {
              precio = numero;
            }
          }
        } else {
          // Asumir que está en USD
          session.moneda = 'USD';
          precio = parseInt(montoTexto.replace(/\D/g, ''));
        }
        
        session.criterios.precioMax = precio;
        session.criterios.esGuaranies = esGuaranies;
        session.step = 'preguntar_tipo';
        userSessions.set(From, session);
        
        let montoMostrar = '';
        if (precio) {
          if (esGuaranies) {
            montoMostrar = `Gs. ${precio.toLocaleString('es-PY')}`;
          } else {
            montoMostrar = `USD ${precio.toLocaleString()}`;
          }
        } else {
          montoMostrar = 'sin límite';
        }
        
        await twilioClient.messages.create({
          body: `¡Presupuesto ${montoMostrar} anotado! ✓\n\n¿Tenés preferencia por algún tipo de propiedad?\n\n• Casa\n• Departamento\n• Dúplex\n• Local/Oficina\n• Terreno\n• O escribime "cualquiera"`,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: From,
        });
        return;
      }
      
      // Paso 4: Preguntar TIPO de propiedad
      if (session.step === 'preguntar_tipo' && Body.trim().length > 0) {
        const tipo = Body.trim().toLowerCase();
        
        if (tipo !== 'cualquiera' && tipo !== 'no' && tipo !== 'nop') {
          // Mapear sinónimos comunes
          if (tipo.includes('depto')) session.criterios.tipoPropiedad = 'departamento';
          else if (tipo.includes('casa')) session.criterios.tipoPropiedad = 'casa';
          else if (tipo.includes('duplex') || tipo.includes('dúplex')) session.criterios.tipoPropiedad = 'duplex';
          else if (tipo.includes('terreno') || tipo.includes('lote')) session.criterios.tipoPropiedad = 'terreno';
          else if (tipo.includes('oficina') || tipo.includes('local')) session.criterios.tipoPropiedad = 'oficina';
          else session.criterios.tipoPropiedad = tipo;
        }
        
        session.criterios.tipo = session.intencion === 'alquilar' ? 'alquiler' : 'venta';
        session.step = 'buscando';
        userSessions.set(From, session);
        
        // Mensaje de búsqueda
        await twilioClient.messages.create({
          body: '🔍 Buscando propiedades con tus criterios...',
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: From,
        });
        
        // Buscar propiedades
        const criteria = session.criterios;
        const results = searchProperties(criteria);
        
        // Construir respuesta
        let responseMessage = '';
        
        if (results.length === 0) {
          responseMessage = 'No encontré propiedades con esos criterios exactos 😕\n\n¿Querés que busque con filtros más amplios? Escribime:\n• "Más zona" para ver otras zonas\n• "Más precio" para ver otros rangos\n• "Cualquiera" para ver todas las opciones';
        } else {
          responseMessage = `¡Encontré ${results.length} propiedades para vos! 🎉\n\n`;
          
          results.slice(0, 3).forEach((p, i) => {
            responseMessage += `${i + 1}. ${p.title}\n`;
            
            // Mostrar precio en la moneda que eligió el usuario
            if (session.moneda === 'GS' && session.criterios.esGuaranies) {
              // Convertir USD a Gs para mostrar (aprox 1 USD = 7,500 Gs)
              const precioGs = p.price * 7500;
              responseMessage += `   💰 Gs. ${precioGs.toLocaleString('es-PY')}${p.type === 'alquiler' ? '/mes' : ''}\n`;
            } else {
              responseMessage += `   💰 USD ${p.price.toLocaleString()}${p.type === 'alquiler' ? '/mes' : ''}\n`;
            }
            
            responseMessage += `   📍 ${p.neighborhood}, ${p.city}\n`;
            responseMessage += `   🏠 ${p.bedrooms} dorm, ${p.area}m²\n\n`;
          });
          
          responseMessage += '¿Te interesa alguna? Responde con el número para más detalles, o escribe SIGUIENTE para ver más opciones.';
        }
        
        await twilioClient.messages.create({
          body: responseMessage,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: From,
        });
        
        // Resetear sesión para próxima búsqueda
        userSessions.delete(From);
        return;
      }
    }
    
    // Si llegó acá, procesar como mensaje libre (búsqueda directa)
    await twilioClient.messages.create({
      body: '🔍 Buscando propiedades para ti...',
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: From,
    });

    const criteria = await extractCriteriaWithAI(Body);
    const results = searchProperties(criteria);
    const aiMessage = await generateAIResponse(Body, criteria, results);

    let responseMessage = aiMessage;
    
    if (results.length > 0) {
      responseMessage += '\n\n';
      results.slice(0, 3).forEach((p, i) => {
        responseMessage += `${i + 1}. ${p.title}\n`;
        responseMessage += `   💰 USD ${p.price.toLocaleString()}${p.type === 'alquiler' ? '/mes' : ''}\n`;
        responseMessage += `   📍 ${p.neighborhood}, ${p.city}\n`;
        responseMessage += `   🏠 ${p.bedrooms} dorm, ${p.area}m²\n\n`;
      });
      responseMessage += '¿Te interesa alguna? Responde con el número para más detalles, o escribe SIGUIENTE para ver más opciones.';
    }

    await twilioClient.messages.create({
      body: responseMessage,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: From,
    });

    console.log('Response sent successfully');

  } catch (error) {
    console.error('Error processing message:', error);
    
    await twilioClient.messages.create({
      body: 'Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.',
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: From,
    });
  }
});

// Twilio webhook validation (optional but recommended)
app.post('/webhook/whatsapp/validate', (req, res) => {
  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );

  if (isValid) {
    res.status(200).send('Valid');
  } else {
    res.status(403).send('Invalid signature');
  }
});

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