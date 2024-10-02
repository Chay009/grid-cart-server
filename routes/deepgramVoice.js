const express = require('express');
const axios = require('axios');

const router = express.Router();


router.post('/', async (req, res) => {

  // this is set for groq chat completion in client

/*
for ai react package has this 
interface Message {
    id: string;
    tool_call_id?: string;
    createdAt?: Date;
    content: string;
    ui?: string | JSX.Element | JSX.Element[] | null | undefined;
    role: 'system' | 'user' | 'assistant' | 'function' | 'data' | 'tool';
    /**
     * If the message has a role of `function`, the `name` field is the name of the function.
     * Otherwise, the name field should not be set.
     */
    //name?: string;
    /**
     * If the assistant role makes a function call, the `function_call` field
     * contains the function call name and arguments. Otherwise, the field should
     * not be set. (Deprecated and replaced by tool_calls.)
     */
//     function_call?: string | FunctionCall;
//     data?: JSONValue;
//     /**
//      * If the assistant role makes a tool call, the `tool_calls` field contains
//      * the tool call name and arguments. Otherwise, the field should not be set.
//      */
//     tool_calls?: string | ToolCall[];
//     /**
//      * Additional message-specific information added on the server via StreamData
//      */
//     annotations?: JSONValue[] | undefined;
// }


 

 /*
 for now if client using groq 
 try to send{
 text:"",
 voice_id:"",
 /?model-name
 }
  */
  const { text, params } = req.body;
  const model = params?.model || 'aura-perseus-en';  // Default model if none is provided
  const start = Date.now();

  try {
    const response = await axios.post(
      `${process.env.DEEPGRAM_STT_DOMAIN}/v1/speak?model=${model}`,
      {
        text: text
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `token ${process.env.DEEPGRAM_API_KEY || ''}`,
          
          
        },
        responseType: 'arraybuffer',  // Expecting binary audio data
      }
    );

    const latency = Date.now() - start;

    res.setHeader('X-DG-Latency', `${latency}`);
    res.setHeader('Content-Type', 'audio/mp3');
    res.send(response.data);  // Sending back the audio data
  } catch (error) {
    console.error('Error occurred:', error.message || error);
    res.status(500).send('An error occurred processing your request.');
  }
});

module.exports = router;
