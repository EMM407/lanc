// EmailJS service integration for React Native
import emailjs from '@emailjs/react-native';

export interface EmailData {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

// Initialize EmailJS with your credentials
const initEmailJS = () => {
  const publicKey = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;
  
  if (publicKey) {
    emailjs.init({
      publicKey,
      privateKey,
    });
  }
};

// Call initialization
initEmailJS();

// Enhanced EmailJS integration for direct email sending
export async function sendEmail(emailData: EmailData): Promise<EmailResponse> {
  const serviceId = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
  
  if (!serviceId || !templateId || !publicKey) {
    console.warn('EmailJS configuration is missing. Falling back to simulation.');
    return simulateEmailSend(emailData);
  }

  // Validate email data
  if (!emailData.to || !emailData.subject || !emailData.body) {
    return {
      success: false,
      error: 'Missing required email fields (to, subject, or body)',
    };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailData.to)) {
    return {
      success: false,
      error: 'Invalid email address format',
    };
  }

  try {
    console.log('📧 Sending email via EmailJS...');
    console.log('To:', emailData.to);
    console.log('Subject:', emailData.subject);

    // Prepare template parameters for EmailJS
    const templateParams = {
      to_email: emailData.to,
      to_name: emailData.to.split('@')[0], // Extract name from email
      from_name: emailData.from || 'Business Manager',
      from_email: emailData.from || 'noreply@businessmanager.com',
      subject: emailData.subject,
      message: emailData.body,
      reply_to: emailData.replyTo || emailData.from || 'noreply@businessmanager.com',
      // Add CC and BCC if provided
      ...(emailData.cc && emailData.cc.length > 0 && { cc_emails: emailData.cc.join(', ') }),
      ...(emailData.bcc && emailData.bcc.length > 0 && { bcc_emails: emailData.bcc.join(', ') }),
    };

    const response = await emailjs.send(
      serviceId,
      templateId,
      templateParams
    );

    console.log('✅ Email sent successfully via EmailJS');
    console.log('Response:', response);

    return {
      success: true,
      messageId: response.text || 'emailjs_' + Date.now(),
      details: response,
    };
  } catch (error) {
    console.error('❌ Error sending email via EmailJS:', error);
    
    // Provide helpful error messages
    let errorMessage = 'Failed to send email. Please try again.';
    if (error instanceof Error) {
      if (error.message.includes('Invalid') || error.message.includes('invalid')) {
        errorMessage = 'Invalid email configuration. Please check your EmailJS settings.';
      } else if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
        errorMessage = 'Too many emails sent. Please wait a moment and try again.';
      } else if (error.message.includes('Network') || error.message.includes('network')) {
        errorMessage = 'Network connection error. Please check your internet connection and try again.';
      } else {
        errorMessage = `Send failed: ${error.message}`;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      details: error,
    };
  }
}

// Send email with template support
export async function sendEmailWithTemplate(
  templateData: {
    to: string;
    templateId?: string;
    variables?: Record<string, any>;
  },
  emailData: Partial<EmailData> = {}
): Promise<EmailResponse> {
  const serviceId = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = templateData.templateId || process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
  
  if (!serviceId || !templateId) {
    return simulateEmailSend({
      to: templateData.to,
      subject: 'Template Email',
      body: 'This would be a template-based email.',
      ...emailData,
    });
  }

  try {
    const templateParams = {
      to_email: templateData.to,
      ...templateData.variables,
      ...emailData,
    };

    const response = await emailjs.send(serviceId, templateId, templateParams);

    return {
      success: true,
      messageId: response.text || 'emailjs_template_' + Date.now(),
      details: response,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error,
    };
  }
}

// Fallback simulation for development/testing
async function simulateEmailSend(emailData: EmailData): Promise<EmailResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log('📧 Email Simulation (EmailJS not configured):');
  console.log('To:', emailData.to);
  console.log('Subject:', emailData.subject);
  console.log('Body Preview:', emailData.body.substring(0, 100) + '...');
  
  return {
    success: true,
    messageId: `sim_${Date.now()}`,
  };
}

// Bulk email sending
export async function sendBulkEmails(
  emails: EmailData[]
): Promise<{ success: EmailResponse[]; failed: { email: EmailData; error: string }[] }> {
  const success: EmailResponse[] = [];
  const failed: { email: EmailData; error: string }[] = [];

  // Send emails with a small delay to avoid rate limiting
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      if (result.success) {
        success.push(result);
      } else {
        failed.push({ email, error: result.error || 'Unknown error' });
      }
      
      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      failed.push({ 
        email, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return { success, failed };
}

// Email validation utility
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Email preview utility
export function previewEmail(emailData: EmailData): string {
  return formatEmailBody(emailData.body);
}

// Enhanced HTML formatting with better styling
function formatEmailBody(body: string): string {
  const htmlBody = body
    .split('\n')
    .map(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        return '<br>';
      }
      // Convert URLs to clickable links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const linkedLine = trimmedLine.replace(urlRegex, '<a href="$1" style="color: #3B82F6;">$1</a>');
      return `<p style="margin: 8px 0; line-height: 1.5;">${linkedLine}</p>`;
    })
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      ${htmlBody}
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #6b7280; margin: 0;">
        Sent via Business Manager
      </p>
    </div>
  `;
}

// Alternative email services configuration
export const EMAIL_SERVICES = {
  EMAILJS: 'emailjs',
  SMTP: 'smtp',
  SENDGRID: 'sendgrid',
  MAILGUN: 'mailgun',
} as const;

// EmailJS configuration helper
export const getEmailJSConfig = () => {
  return {
    serviceId: process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID,
    templateId: process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID,
    publicKey: process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY,
  };
};

// Check if EmailJS is properly configured
export const isEmailJSConfigured = (): boolean => {
  const config = getEmailJSConfig();
  return !!(config.serviceId && config.templateId && config.publicKey);
};