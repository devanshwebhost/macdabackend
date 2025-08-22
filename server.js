import express from "express";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();


const app = express();
app.use(cors());
app.use(bodyParser.json());


const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// ✅ Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // e.g. indocsmedia@gmail.com
    pass: process.env.EMAIL_PASS, // 16-char App Password
  },
});

// ... (imports and initial setup remain the same)

// Nodemailer transporter setup...

// ... (imports, app setup, groq, and transporter are the same)
// ... (imports, app setup, groq, and transporter are the same)

const tools = [
  {
    type: "function",
    function: {
      name: "send_email_to_client",
      description: "Sends a follow-up email to a potential client who has provided their email and explicitly asked to be contacted.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "The client's email address." },
          subject: { type: "string", description: "A compelling subject line for the email." },
          message: { type: "string", description: "A personalized message for the body of the email." },
        },
        required: ["email", "subject", "message"],
      },
    },
  },
];

app.post("/chat", async (req, res) => {
  const { message, userKey } = req.body;
  const userFile = path.join(dataDir, `${userKey}.json`);
  let history = fs.existsSync(userFile) ? JSON.parse(fs.readFileSync(userFile)) : [];
  history.push({ role: "user", content: message });

  try {
    // --- STEP 1: First API call to determine AI's next move ---
    const completion = await groq.chat.completions.create({
      model: "llama3-70b-8192", // A model known for reliable tool use
      messages: [
        {
          role: "system",
          content: `You are Macda, a helpful AI assistant for Indocs Media.
          Your primary goal is to have a natural conversation.

          Indocs media services include:
            - Website Development (static and customizable - web tools)
            - Video Editing (shorts, reels, and long-form content)
            - Ads Shooting (product and service ads)
            - video Production (from script to final cut)
            - videography (shooting and editing)
            - Photography (product and service photography)
            - Content Creation, Copywriting, UGC Ads (shorts, reels)
            Never Talk about Pricing directly as it is not fixed and depends on the client's needs. In this situation ask clint to contact us via email - indocsmedia@gmail.com !
          
          You have a tool called "send_email_to_client".
          ALways Confirm with the user before using this tool.
          **Strictly follow these rules for using the tool:**
          1.  NEVER use the tool unless the user has first provided their email address.
          2.  NEVER use the tool unless the user has *explicitly* asked for an email or confirmed they want to be contacted.
          
          If these two conditions are met, call the tool. After the tool runs, your job is to confirm the action to the user and ask how else you can help.
          If the conditions are NOT met, simply continue the conversation.`
        },
        ...history,
      ],
      tools: tools,
      tool_choice: "auto",
    });

    let responseMessage = completion.choices[0].message;

    // --- STEP 2: Check if the AI decided to use a tool ---
    if (responseMessage.tool_calls) {
      history.push(responseMessage); // Save the AI's decision to use the tool
      const toolCall = responseMessage.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      // --- STEP 2a: Run Safeguards and Execute the Tool ---
      // 🔒 Your existing safeguards are great, we'll keep them.
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!args.email || !emailRegex.test(args.email)) {
          // If safeguards fail, report an error back to the AI
          history.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: "Invalid or missing email address provided." }),
          });
      } else {
        try {
          // If safeguards pass, send the emails
          await transporter.sendMail({
            from: '"Macda AI" <indocsmedia@gmail.com>',
            to: "indocsmedia@gmail.com",
            subject: `New Lead from Macda: ${args.email}`,
            text: `Client is interested!\nEmail: ${args.email}\n\nAI's suggested message:\n${args.message}`,
          });

          await transporter.sendMail({
            from: '"Macda - Indocs Media" <indocsmedia@gmail.com>',
            to: args.email,
            subject: args.subject,
            text: args.message,
          });

          // ✅ Report SUCCESS back to the AI
          history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true, message: `Email successfully sent to ${args.email}` }),
          });
        } catch (emailError) {
          // ❌ Report FAILURE back to the AI
           history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: "An internal error occurred while sending the email." }),
          });
        }
      }

      // --- STEP 3: Second API call to get a natural language response ---
      const finalCompletion = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: history, // Send the complete history, including the tool result
      });

      responseMessage = finalCompletion.choices[0].message;
    }

    // --- STEP 4: Save and send the final response to the user ---
    const finalReply = responseMessage.content;
    history.push({ role: "assistant", content: finalReply });
    fs.writeFileSync(userFile, JSON.stringify(history, null, 2));
    res.json({ reply: finalReply });

  } catch (err) {
    console.error("API or Logic Error:", err);
    res.status(500).json({ reply: "Sorry, I encountered an unexpected error. Please try again." });
  }
});

app.listen(5000, () => {
  console.log("✅ AI server running on http://localhost:5000");
});