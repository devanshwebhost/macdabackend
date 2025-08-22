// testEmail.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // .env file load karne ke liye

// Gmail transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // e.g. indocsmedia@gmail.com
    pass: process.env.EMAIL_PASS, // 16-char App Password
  },
});

// Mail options
const mailOptions = {
  from: process.env.EMAIL_USER,
  to: "devanshrajput032006@gmail.com", // khud ko bhejke check karo
  subject: "✅ Test Email from Macda",
  text: "Hello! This is a test email from your Node.js setup.",
};

// Send email
async function sendTest() {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log("Message ID:", info.messageId);
  } catch (err) {
    console.error("❌ Email Error:", err.message);
    console.error(err);
  }
}

sendTest();
