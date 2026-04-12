const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendOTP = async (to, otp, type = 'register') => {
    let subject, text, html;
    if (type === 'register') {
        subject = 'Votre code de vérification pour BricoloPro';
        text = `Votre code de vérification est: ${otp}. Ce code expire dans 10 minutes.`;
        html = `<h3>Bienvenue sur BricoloPro!</h3><p>Votre code de vérification est: <strong>${otp}</strong>.</p><p>Ce code expire dans 10 minutes.</p>`;
    } else if (type === 'reset') {
        subject = 'Réinitialisation de votre mot de passe - BricoloPro';
        text = `Votre code de réinitialisation est: ${otp}. Ce code expire dans 10 minutes.`;
        html = `<h3>Réinitialisation de mot de passe</h3><p>Votre code de réinitialisation est: <strong>${otp}</strong>.</p><p>Ce code expire dans 10 minutes.</p>`;
    }

    const mailOptions = {
        from: process.env.EMAIL_USER || '"BricoloPro" <noreply@bricolopro.com>',
        to,
        subject,
        text,
        html
    };

    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set. Simulating email sending.');
            console.log(`[SIMULATED EMAIL] To: ${to} | OTP: ${otp} | Type: ${type}`);
            return true;
        }
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendOTP };
