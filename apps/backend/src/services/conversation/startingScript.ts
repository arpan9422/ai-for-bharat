/**
 * Starting Script Service
 * 
 * Generates personalized opening lines for voice calls made by Priya (AI voice agent)
 * to leads in Rupeezy's partner program.
 * 
 * Design Goals:
 * - Performance: < 100ms response time
 * - Simplicity: Pure function interface with no external dependencies
 * - Flexibility: Support custom RM scripts and template-based generation
 * - Localization: Native support for Hindi, Hinglish, and English
 */

/**
 * Supported languages for opening lines
 */
export type Language = 'hindi' | 'hinglish' | 'english';

/**
 * Internal lead type classification based on occupation/background
 */
export type LeadType = 'mfd_distributor' | 'insurance_agent' | 'sub_broker' | 'unknown';

/**
 * Lead profile input structure
 */
export interface LeadProfile {
  /** Lead ID for tracking */
  lead_id?: string;
  /** Lead phone number for matching existing RM dashboard leads */
  phone?: string;
  /** Lead's name for personalization */
  name?: string;
  /** Professional background (e.g., "MFD", "insurance agent") */
  occupation?: string;
  /** Additional context (alternative to occupation) */
  background?: string;
  /** Preferred language for the opening line */
  language?: Language;
  /** RM-defined custom script (takes priority over templates) */
  callScript?: string;
  /** Compact memory from the most recent prior call with this lead */
  previousConversation?: {
    callId: string;
    date: string;
    score?: number;
    status?: string;
    keyPoints: string[];
    objectionsRaised: string[];
    statedIntent?: string | null;
    nextAction?: string;
  };
}

/**
 * In-memory template storage for opening lines
 * Organized by lead type and language for O(1) lookup
 */
export const TEMPLATES: Record<LeadType, Record<Language, string>> = {
  mfd_distributor: {
    hinglish: "Namaste{name}! Main Priya bol rahi hoon Rupeezy se. Aap distribution mein hain — seedha poochhti hoon, aapka current broker aapko kitna brokerage share deta hai?",
    hindi: "नमस्ते{name}! मैं Priya बोल रही हूँ Rupeezy से। आप distribution में हैं — सीधे पूछती हूँ, आपका current broker आपको कितना brokerage share देता है?",
    english: "Hi{name}! This is Priya from Rupeezy. I see you're in distribution — quick question, what brokerage share does your current broker give you?"
  },
  insurance_agent: {
    hinglish: "Namaste{name}! Main Priya hoon Rupeezy se. Aap insurance mein hain — kya aapne kabhi equity distribution bhi explore kiya hai? Ek interesting opportunity hai aapke liye.",
    hindi: "नमस्ते{name}! मैं Priya हूँ Rupeezy से। आप insurance में हैं — क्या आपने कभी equity distribution भी explore किया है?",
    english: "Hi{name}! Priya here from Rupeezy. You're in insurance — have you ever explored equity distribution as an additional income stream?"
  },
  sub_broker: {
    hinglish: "Namaste{name}! Main Priya bol rahi hoon Rupeezy se. Aap already market mein hain — toh directly poochhti hoon: kya aap 100% brokerage share aur daily payout mein interested honge?",
    hindi: "नमस्ते{name}! Main Priya bol rahi hoon Rupeezy se। आप already market में हैं — तो directly पूछती हूँ: क्या आप 100% brokerage share और daily payout में interested होंगे?",
    english: "Hi{name}! This is Priya from Rupeezy. You're already in the market — so I'll be direct: would you be interested in 100% brokerage share with daily payouts?"
  },
  unknown: {
    hinglish: "Namaste{name}! Main Priya bol rahi hoon Rupeezy ki taraf se. Ek partner program ke baare mein baat karni thi — kya aapke paas 2 minute hain?",
    hindi: "नमस्ते{name}! मैं Priya बोल रही हूँ Rupeezy की तरफ से। एक partner program के बारे में बात करनी थी — क्या आपके पास 2 minute हैं?",
    english: "Hi{name}! This is Priya calling from Rupeezy. I wanted to talk to you about a partner program — do you have 2 minutes?"
  }
};

/**
 * Default fallback script for error cases
 * Used when lead profile is invalid or template lookup fails
 */
export const FALLBACK_SCRIPT = "Namaste! Main Priya bol rahi hoon Rupeezy ki taraf se. Kya aapke paas 2 minute hain?";

/**
 * Classifies lead type based on occupation or background fields
 * @param leadProfile - Lead profile containing occupation/background
 * @returns Classified lead type
 */
export function classifyLeadType(leadProfile: LeadProfile): LeadType {
  const occupation = (leadProfile.occupation || '').toLowerCase();
  const background = (leadProfile.background || '').toLowerCase();
  const combined = `${occupation} ${background}`;

  if (combined.includes('mfd') || combined.includes('distributor')) {
    return 'mfd_distributor';
  }
  if (combined.includes('insurance agent')) {
    return 'insurance_agent';
  }
  if (combined.includes('sub-broker') || combined.includes('sub broker')) {
    return 'sub_broker';
  }
  return 'unknown';
}

/**
 * Normalizes language preference to a valid Language type
 * @param language - Language preference from lead profile
 * @returns Normalized language (defaults to 'hinglish')
 */
export function normalizeLanguage(language?: string): Language {
  if (language === 'hindi' || language === 'hinglish' || language === 'english') {
    return language;
  }
  return 'hinglish';
}

/**
 * Selects appropriate template based on lead type and language
 * @param leadType - Classified lead type
 * @param language - Normalized language
 * @returns Template string
 */
export function selectTemplate(leadType: LeadType, language: Language): string {
  try {
    return TEMPLATES[leadType][language];
  } catch (error) {
    console.error('[StartingScript] Template lookup failed:', error);
    return FALLBACK_SCRIPT;
  }
}

/**
 * Interpolates name into template, handling missing names gracefully
 * @param template - Template string with optional {name} placeholder
 * @param name - Lead's name (optional)
 * @returns Template with name interpolated or placeholder removed
 */
export function interpolateName(template: string, name?: string): string {
  if (name && name.trim().length > 0) {
    return template
      .replace(/\{name\}/g, () => ' ' + name.trim())
      .replace(/\s+/g, ' ')
      .replace(/\s+([,!?।])/g, '$1')
      .trim();
  }
  return template
    .replace(/\s*\{name\}\s*,?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,!?।])/g, '$1')
    .trim();
}

/**
 * Determines whether to use custom script or template-based generation
 * @param leadProfile - Lead profile
 * @returns 'custom' if callScript exists, 'template' otherwise
 */
export function selectScriptSource(leadProfile: LeadProfile): 'custom' | 'template' {
  return leadProfile.callScript && leadProfile.callScript.trim().length > 0
    ? 'custom'
    : 'template';
}

/**
 * Generates a personalized opening line for a voice call
 * 
 * This is the main entry point for the Starting Script Service.
 * It orchestrates all helper functions to produce the final opening line.
 * 
 * @param leadProfile - Lead information including name, occupation, language, and optional custom script
 * @returns Opening line string ready for TTS
 */
export function getStartingScript(leadProfile: LeadProfile | null | undefined): string {
  try {
    // Handle invalid input
    if (!leadProfile || typeof leadProfile !== 'object') {
      console.error('[StartingScript] Invalid lead profile:', leadProfile);
      return FALLBACK_SCRIPT;
    }

    // Check if custom script is provided
    const scriptSource = selectScriptSource(leadProfile);
    
    if (scriptSource === 'custom' && leadProfile.callScript) {
      // Use custom script with name interpolation
      return interpolateName(leadProfile.callScript, leadProfile.name);
    }

    // Template-based generation
    const leadType = classifyLeadType(leadProfile);
    const language = normalizeLanguage(leadProfile.language);
    const template = selectTemplate(leadType, language);
    
    return interpolateName(template, leadProfile.name);
  } catch (error) {
    console.error('[StartingScript] Error generating script:', error);
    return FALLBACK_SCRIPT;
  }
}
