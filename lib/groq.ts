export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const invoicePrompts = {
  generateInvoice: (clientName: string, projectName: string, items: any[]): GroqMessage[] => [
    {
      role: 'system',
      content: `You are an expert at generating professional invoices. 
      Create invoice content including notes and terms based on the provided information.
      The notes should include a thank you message and any relevant details.
      The terms should include payment conditions and other important terms.
      Format the response with clear sections for Notes and Terms.`
    },
    {
      role: 'user',
      content: `Client: ${clientName}
Project: ${projectName}
Items: ${JSON.stringify(items)}`
    }
  ],
  
  parseSummary: (summary: string): GroqMessage[] => [
    {
      role: 'system',
      content: `You are an expert at parsing work summaries and extracting line items for invoices. 
      Extract the items, quantities, and prices from the following summary and return them as a JSON array. 
      Each item should have description, quantity (default to 1 if not specified), and rate (price). 
      Return ONLY valid JSON. Example output: 
      [{"description": "Website design", "quantity": 1, "rate": 500}, 
      {"description": "SEO optimization", "quantity": 1, "rate": 200}]`
    },
    {
      role: 'user',
      content: summary
    }
  ]
};

export const contractPrompts = {
  generateContract: (type: string, clientName: string, projectName: string, scope: string): GroqMessage[] => [
    {
      role: 'system',
      content: 'You are a legal contract specialist. Generate professional, legally sound contract content based on the provided information. Include all necessary clauses, terms, and conditions appropriate for the contract type.',
    },
    {
      role: 'user',
      content: `Generate a ${type} contract for:
Client: ${clientName}
Project: ${projectName}
Scope: ${scope}

Please provide a complete contract with:
1. Parties section
2. Scope of work
3. Payment terms
4. Timeline and deliverables
5. Intellectual property rights
6. Termination clauses
7. Liability limitations
8. Signature sections`,
    },
  ],
};

export const emailPrompts = {
  generateEmail: (purpose: string, clientName: string, context: string): GroqMessage[] => [
    {
      role: 'system',
      content: 'You are a professional business communication specialist. Generate professional, clear, and engaging email content based on the provided context and purpose.',
    },
    {
      role: 'user',
      content: `Generate a professional email for:
Purpose: ${purpose}
Client: ${clientName}
Context: ${context}

Please provide:
1. Professional subject line
2. Well-structured email body
3. Appropriate tone and language
4. Clear call-to-action if needed`,
    },
  ],
};

export async function generateWithGroq(messages: GroqMessage[]): Promise<string> {
  const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  
  if (!GROQ_API_KEY) {
    console.warn('Groq API key is missing. Falling back to mock response.');
    return generateMockResponse(messages);
  }

  const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    console.log('🤖 Calling Groq API with key:', GROQ_API_KEY?.substring(0, 10) + '...');
    
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API error details:', errorData);
      
      // If API key is invalid, fall back to mock response
      if (response.status === 401 || errorData.error?.code === 'invalid_api_key') {
        console.warn('Invalid Groq API key, falling back to mock response');
        return generateMockResponse(messages);
      }
      
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling Groq API:', error);
    
    // Fall back to mock response on any error
    console.warn('Groq API failed, falling back to mock response');
    return generateMockResponse(messages);
  }
}

// Mock response generator for when Groq API is unavailable
function generateMockResponse(messages: GroqMessage[]): string {
  const userMessage = messages.find(m => m.role === 'user')?.content || '';
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  
  // Generate appropriate mock responses based on context
  if (systemMessage.includes('email')) {
    return generateMockEmail(userMessage);
  } else if (systemMessage.includes('contract')) {
    return generateMockContract(userMessage);
  } else if (systemMessage.includes('invoice')) {
    return generateMockInvoice(userMessage);
  }
  
  return 'This is a mock response. Please configure a valid Groq API key to use AI features.';
}

function generateMockEmail(context: string): string {
  return `Subject: Professional Follow-up

Dear [Client Name],

I hope this email finds you well. I wanted to reach out regarding our recent project collaboration.

We truly appreciate the opportunity to work with you and your team. Your feedback and collaboration throughout the process have been invaluable.

If you have any questions or need any additional information, please don't hesitate to reach out.

Best regards,
[Your Name]

Note: This is a mock response. Please configure a valid Groq API key for AI-generated content.`;
}

function generateMockContract(context: string): string {
  return `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into between [Your Company] and [Client Company].

1. SCOPE OF WORK
The service provider agrees to deliver professional services as outlined in the project specifications.

2. PAYMENT TERMS
Payment shall be made according to the agreed schedule and terms.

3. DELIVERABLES
All deliverables will be provided according to the project timeline.

4. INTELLECTUAL PROPERTY
All work product shall be owned by the client upon full payment.

5. TERMINATION
Either party may terminate this agreement with written notice.

Note: This is a mock contract. Please configure a valid Groq API key for AI-generated legal content.`;
}

function generateMockInvoice(context: string): string {
  return `Notes: Thank you for your business! We appreciate the opportunity to work with you on this project. All work has been completed to the highest standards and we look forward to future collaborations.

Terms: Payment is due within 30 days of invoice date. Late payments may incur additional fees. Please remit payment to the address listed above.

Note: This is mock content. Please configure a valid Groq API key for AI-generated invoice content.`;
}