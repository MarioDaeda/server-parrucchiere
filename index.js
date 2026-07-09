const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
    try {
        const { message } = req.body;

        if (message && message.type === 'tool-calls') {
            const toolCalls = message.toolCalls;
            const toolResponses = [];

            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const args = toolCall.function.arguments; 

                console.log(`Richiesta tool ricevuta: ${functionName}`, args);

                if (functionName === 'checkAvailability') {
                    toolResponses.push({
                        toolCallId: toolCall.id,
                        result: "Mock: Ci sono posti liberi domenica alle 15:00 e alle 16:30." 
                    });
                } else if (functionName === 'bookAppointment') {
                    toolResponses.push({
                        toolCallId: toolCall.id,
                        result: "Mock: Appuntamento confermato con successo."
                    });
                } else {
                    toolResponses.push({
                        toolCallId: toolCall.id,
                        result: "Errore: Tool non riconosciuto dal server."
                    });
                }
            }

            return res.status(201).json({
                results: toolResponses
            });
        }

        return res.status(200).send('Webhook ricevuto correttamente.');
    } catch (error) {
        console.error('Errore del server:', error);
        return res.status(500).send('Errore interno del server');
    }
});

app.listen(PORT, () => {
    console.log(`Server operativo e in ascolto sulla porta ${PORT}`);
});