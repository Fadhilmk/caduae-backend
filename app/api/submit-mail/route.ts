import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Type definitions
type FormType = 'contact' | 'support' | 'quote';

interface BaseFormData {
  formType: FormType;
  name: string;
  email: string;
}

interface ContactFormData extends BaseFormData {
  formType: 'contact';
  phone: string;
  message: string;
}

interface SupportFormData extends BaseFormData {
  formType: 'support';
  phone: string;
  message: string;
}

interface QuoteFormData extends BaseFormData {
  formType: 'quote';
  mobile?: string;
  product: string;
}

type FormData = ContactFormData | SupportFormData | QuoteFormData;

// Valid product types for quote form
const VALID_PRODUCTS = ['ARCHITECT', 'LANDMARK', 'SPOTLIGHT', 'FUNDAMENTALS'];

// Email validation helper
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validation function
function validateFormData(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request data' };
  }

  const formData = data as Record<string, unknown>;

  if (!formData.formType) {
    return { valid: false, error: 'formType is required' };
  }

  if (!['contact', 'support', 'quote'].includes(formData.formType as string)) {
    return { valid: false, error: 'Invalid formType. Must be contact, support, or quote' };
  }

  if (!formData.name || typeof formData.name !== 'string' || formData.name.trim() === '') {
    return { valid: false, error: 'name is required' };
  }

  if (!formData.email || typeof formData.email !== 'string' || !isValidEmail(formData.email)) {
    return { valid: false, error: 'Valid email is required' };
  }

  // Validate based on form type
  if (formData.formType === 'contact' || formData.formType === 'support') {
    if (!formData.phone || typeof formData.phone !== 'string' || formData.phone.trim() === '') {
      return { valid: false, error: 'phone is required for contact and support forms' };
    }
    if (!formData.message || typeof formData.message !== 'string' || formData.message.trim() === '') {
      return { valid: false, error: 'message is required for contact and support forms' };
    }
  }

  if (formData.formType === 'quote') {
    if (!formData.product || typeof formData.product !== 'string' || formData.product.trim() === '') {
      return { valid: false, error: 'product is required for quote form' };
    }
    if (!VALID_PRODUCTS.includes(formData.product)) {
      return { valid: false, error: `product must be one of: ${VALID_PRODUCTS.join(', ')}` };
    }
  }

  return { valid: true };
}

// Format email content based on form type
function formatEmailContent(data: FormData): { subject: string; html: string; text: string } {
  let subject = '';
  let html = '';
  let text = '';

  if (data.formType === 'contact') {
    subject = `New Contact Form Submission - ${data.name}`;
    html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Message:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `;
    text = `
New Contact Form Submission

Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Message: ${data.message}
    `;
  } else if (data.formType === 'support') {
    subject = `New Support Request - ${data.name}`;
    html = `
      <h2>New Support Request</h2>
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Message:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `;
    text = `
New Support Request

Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Message: ${data.message}
    `;
  } else if (data.formType === 'quote') {
    subject = `New Quote Request - ${data.name} - ${data.product}`;
    html = `
      <h2>New Quote Request</h2>
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      ${data.mobile ? `<p><strong>Mobile:</strong> ${data.mobile}</p>` : ''}
      <p><strong>Product:</strong> ${data.product}</p>
    `;
    text = `
New Quote Request

Name: ${data.name}
Email: ${data.email}
${data.mobile ? `Mobile: ${data.mobile}\n` : ''}Product: ${data.product}
    `;
  }

  return { subject, html, text };
}

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  host: 'mail.caduae.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: 'noreply@caduae.com',
    pass: process.env.SMTP_PASSWORD || '',
  },
});

// CORS helper function
function getCorsHeaders(origin: string | null): Record<string, string> {
  // Allowed origins
  const allowedOrigins = [
    'http://localhost:3000',
    'https://caduae.com',
    'https://www.caduae.com',
  ];

  // Check if the origin is allowed, or use * for development
  const allowedOrigin = origin && allowedOrigins.includes(origin) 
    ? origin 
    : process.env.NODE_ENV === 'production' 
      ? 'https://caduae.com' 
      : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const body = await request.json();

    // Validate the request data
    const validation = validateFormData(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: validation.error || 'Validation failed',
        },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const formData = body as FormData;

    // Format email content
    const { subject, html, text } = formatEmailContent(formData);

    // Send email
    await transporter.sendMail({
      from: 'noreply@caduae.com',
      to: 'info@caduae.com',
      subject: subject,
      html: html,
      text: text,
      replyTo: formData.email,
    });

    return NextResponse.json(
      {
        status: 'success',
        message: 'Thank you! Your message has been sent successfully.',
      },
      { 
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while sending your message. Please try again later.';
    return NextResponse.json(
      {
        status: 'error',
        message: errorMessage,
      },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

