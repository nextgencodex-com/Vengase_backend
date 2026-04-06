const { Resend } = require('resend');
const logger = require('../utils/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

const getResendErrorMessage = (result) => {
  if (!result) return 'Unknown error';
  if (result.error && typeof result.error === 'string') return result.error;
  if (result.error && result.error.message) return result.error.message;
  return 'Unknown error';
};

const sendWithFallbackFrom = async (payload, primaryFrom, fallbackFrom) => {
  const primaryResult = await resend.emails.send({
    ...payload,
    from: primaryFrom,
  });

  if (!primaryResult?.error) {
    return { result: primaryResult, usedFrom: primaryFrom, usedFallback: false };
  }

  logger.warn(
    `Primary sender failed (${primaryFrom}): ${getResendErrorMessage(primaryResult)}. Retrying with fallback sender.`
  );

  const fallbackResult = await resend.emails.send({
    ...payload,
    from: fallbackFrom,
  });

  if (fallbackResult?.error) {
    throw new Error(
      `Primary sender failed: ${getResendErrorMessage(primaryResult)} | Fallback sender failed: ${getResendErrorMessage(fallbackResult)}`
    );
  }

  return { result: fallbackResult, usedFrom: fallbackFrom, usedFallback: true };
};

const sendContactEmail = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate input
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate message length
    if (message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long'
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'wevengase@gmail.com';
    const fromEmail = process.env.FROM_EMAIL || 'Vengase <orders@vengase.com>';
    const fallbackFromEmail = process.env.RESEND_FALLBACK_FROM || 'onboarding@resend.dev';

    if (!process.env.RESEND_API_KEY) {
      logger.error('RESEND_API_KEY is missing. Cannot send contact form emails.');
      return res.status(500).json({
        success: false,
        error: 'Email service is not configured. Please try again later.'
      });
    }

    // Send email to admin first (critical path)
    const adminSend = await sendWithFallbackFrom({
      to: adminEmail,
      reply_to: email,
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
          <div style="background-color: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="margin: 0; font-size: 24px;">New Contact Form Submission</h2>
          </div>
          
          <div style="background-color: #fff; padding: 20px; border-radius: 0 0 8px 8px;">
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 12px; text-transform: uppercase;">From</p>
              <p style="margin: 0; font-size: 16px; font-weight: bold; color: #000;">${name}</p>
              <p style="margin: 5px 0 0 0; color: #0066cc; font-size: 14px;">${email}</p>
            </div>

            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 12px; text-transform: uppercase;">Subject</p>
              <p style="margin: 0; font-size: 16px; font-weight: bold; color: #000;">${subject}</p>
            </div>

            <div style="margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 12px; text-transform: uppercase;">Message</p>
              <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word;">${message}</p>
            </div>

            <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <p style="margin: 0; font-size: 12px; color: #666;">
                <strong>Reply to:</strong> ${email}<br>
                <strong>Date:</strong> ${new Date().toLocaleString()}<br>
                <strong>Source:</strong> Contact Form - VENGASE
              </p>
            </div>
          </div>
        </div>
      `
    }, fromEmail, fallbackFromEmail);

    // Send confirmation to user (non-critical path)
    try {
      await sendWithFallbackFrom({
        to: email,
        subject: 'We received your message - VENGASE',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #000; color: #fff; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 24px;">VENGASE</h2>
            </div>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <h3 style="color: #000; margin-top: 0;">Thank you for contacting us, ${name}!</h3>
              
              <p style="color: #333; line-height: 1.6;">
                We have received your message and appreciate you reaching out to VENGASE. Our team will review your inquiry and get back to you as soon as possible, typically within 24-48 hours.
              </p>

              <div style="background-color: #fff; padding: 15px; border-left: 4px solid #000; margin: 20px 0;">
                <p style="margin: 0 0 5px 0; color: #666; font-size: 12px; text-transform: uppercase;">Your Message</p>
                <p style="margin: 0; color: #333; font-weight: bold;">${subject}</p>
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                If you have any urgent matters, feel free to contact us directly at:<br>
                <strong>+94 777 329 692</strong> (WhatsApp Available)<br>
                <strong>support@vengase.com</strong>
              </p>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                  Follow us on social media<br>
                  <a href="https://www.facebook.com/share/17PPiVtRwU/" style="color: #0066cc; margin: 0 10px;">Facebook</a> | 
                  <a href="https://www.instagram.com/wevengase_?igsh=aWM5b28ybmZ1M3Rl" style="color: #0066cc; margin: 0 10px;">Instagram</a> | 
                  <a href="https://www.tiktok.com/@we_vengase?_r=1&_t=ZS-958ml0XGqGH" style="color: #0066cc; margin: 0 10px;">TikTok</a>
                </p>
              </div>
            </div>
          </div>
        `
      }, fromEmail, fallbackFromEmail);
    } catch (confirmError) {
      logger.warn(`Contact confirmation email failed for ${email}: ${confirmError.message}`);
    }

    logger.info(
      `Contact form admin email sent from ${email} with subject: ${subject}. Sender used: ${adminSend.usedFrom}`
    );

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon!'
    });
  } catch (error) {
    logger.error('Error sending contact email:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to send message. Please try again later.'
    });
  }
};

module.exports = {
  sendContactEmail
};
