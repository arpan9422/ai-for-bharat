/**
 * Starting Script Service - Comprehensive Test Suite
 * 
 * Tests for the Starting Script Service that generates personalized opening lines
 * for voice calls made by Priya (AI voice agent).
 * 
 * Includes both unit tests and property-based tests using fast-check.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  LeadProfile,
  Language,
  LeadType,
  TEMPLATES,
  FALLBACK_SCRIPT,
  classifyLeadType,
  normalizeLanguage,
  selectTemplate,
  interpolateName,
  selectScriptSource,
  getStartingScript,
} from '../startingScript';

// ============================================================================
// UNIT TESTS - Constants and Type Definitions
// ============================================================================

describe('Starting Script Service - Constants', () => {
  describe('TEMPLATES constant', () => {
    it('should have templates for all lead types', () => {
      expect(TEMPLATES.mfd_distributor).toBeDefined();
      expect(TEMPLATES.insurance_agent).toBeDefined();
      expect(TEMPLATES.sub_broker).toBeDefined();
      expect(TEMPLATES.unknown).toBeDefined();
    });

    it('should have templates for all languages for each lead type', () => {
      const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
      const languages: Language[] = ['hindi', 'hinglish', 'english'];

      leadTypes.forEach(leadType => {
        languages.forEach(language => {
          expect(TEMPLATES[leadType][language]).toBeDefined();
          expect(typeof TEMPLATES[leadType][language]).toBe('string');
          expect(TEMPLATES[leadType][language].length).toBeGreaterThan(0);
        });
      });
    });

    it('should have templates mentioning Rupeezy', () => {
      const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
      const languages: Language[] = ['hindi', 'hinglish', 'english'];

      leadTypes.forEach(leadType => {
        languages.forEach(language => {
          expect(TEMPLATES[leadType][language]).toContain('Rupeezy');
        });
      });
    });

    it('should have Hindi templates containing Devanagari script', () => {
      const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
      const devanagariRegex = /[\u0900-\u097F]/;

      leadTypes.forEach(leadType => {
        expect(TEMPLATES[leadType].hindi).toMatch(devanagariRegex);
      });
    });

    it('should have Hinglish templates without Devanagari script', () => {
      const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
      const devanagariRegex = /[\u0900-\u097F]/;

      leadTypes.forEach(leadType => {
        expect(TEMPLATES[leadType].hinglish).not.toMatch(devanagariRegex);
      });
    });

    it('should have English templates without Devanagari script', () => {
      const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
      const devanagariRegex = /[\u0900-\u097F]/;

      leadTypes.forEach(leadType => {
        expect(TEMPLATES[leadType].english).not.toMatch(devanagariRegex);
      });
    });
  });

  describe('FALLBACK_SCRIPT constant', () => {
    it('should be defined', () => {
      expect(FALLBACK_SCRIPT).toBeDefined();
    });

    it('should be a non-empty string', () => {
      expect(typeof FALLBACK_SCRIPT).toBe('string');
      expect(FALLBACK_SCRIPT.length).toBeGreaterThan(0);
    });

    it('should mention Rupeezy', () => {
      expect(FALLBACK_SCRIPT).toContain('Rupeezy');
    });

    it('should be in English', () => {
      const devanagariRegex = /[\u0900-\u097F]/;
      expect(FALLBACK_SCRIPT).not.toMatch(devanagariRegex);
    });
  });
});

// ============================================================================
// UNIT TESTS - classifyLeadType()
// ============================================================================

describe('classifyLeadType()', () => {
  it('should classify MFD from occupation', () => {
    expect(classifyLeadType({ occupation: 'MFD' })).toBe('mfd_distributor');
    expect(classifyLeadType({ occupation: 'mfd' })).toBe('mfd_distributor');
    expect(classifyLeadType({ occupation: 'Mutual Fund Distributor' })).toBe('mfd_distributor');
  });

  it('should classify distributor from occupation', () => {
    expect(classifyLeadType({ occupation: 'distributor' })).toBe('mfd_distributor');
    expect(classifyLeadType({ occupation: 'Distributor' })).toBe('mfd_distributor');
    expect(classifyLeadType({ occupation: 'Financial Distributor' })).toBe('mfd_distributor');
  });

  it('should classify insurance agent from occupation', () => {
    expect(classifyLeadType({ occupation: 'insurance agent' })).toBe('insurance_agent');
    expect(classifyLeadType({ occupation: 'Insurance Agent' })).toBe('insurance_agent');
    expect(classifyLeadType({ occupation: 'INSURANCE AGENT' })).toBe('insurance_agent');
  });

  it('should classify sub-broker from occupation', () => {
    expect(classifyLeadType({ occupation: 'sub-broker' })).toBe('sub_broker');
    expect(classifyLeadType({ occupation: 'sub broker' })).toBe('sub_broker');
    expect(classifyLeadType({ occupation: 'Sub-Broker' })).toBe('sub_broker');
  });

  it('should classify from background field when occupation is missing', () => {
    expect(classifyLeadType({ background: 'Works as MFD' })).toBe('mfd_distributor');
    expect(classifyLeadType({ background: 'insurance agent experience' })).toBe('insurance_agent');
  });

  it('should return unknown for unmatched patterns', () => {
    expect(classifyLeadType({ occupation: 'Software Engineer' })).toBe('unknown');
    expect(classifyLeadType({ occupation: 'Teacher' })).toBe('unknown');
    expect(classifyLeadType({ occupation: '' })).toBe('unknown');
  });

  it('should handle mixed case inputs', () => {
    expect(classifyLeadType({ occupation: 'Insurance AGENT' })).toBe('insurance_agent');
    expect(classifyLeadType({ occupation: 'sub-BROKER' })).toBe('sub_broker');
    expect(classifyLeadType({ occupation: 'MFD' })).toBe('mfd_distributor');
  });

  it('should handle empty/null occupation and background', () => {
    expect(classifyLeadType({})).toBe('unknown');
    expect(classifyLeadType({ occupation: '', background: '' })).toBe('unknown');
  });
});

// ============================================================================
// UNIT TESTS - normalizeLanguage()
// ============================================================================

describe('normalizeLanguage()', () => {
  it('should return valid languages as-is', () => {
    expect(normalizeLanguage('hindi')).toBe('hindi');
    expect(normalizeLanguage('hinglish')).toBe('hinglish');
    expect(normalizeLanguage('english')).toBe('english');
  });

  it('should default to hinglish for undefined', () => {
    expect(normalizeLanguage(undefined)).toBe('hinglish');
  });

  it('should default to hinglish for invalid values', () => {
    expect(normalizeLanguage('spanish')).toBe('hinglish');
    expect(normalizeLanguage('french')).toBe('hinglish');
    expect(normalizeLanguage('')).toBe('hinglish');
  });
});

// ============================================================================
// UNIT TESTS - selectTemplate()
// ============================================================================

describe('selectTemplate()', () => {
  it('should return correct template for lead type and language', () => {
    const template = selectTemplate('mfd_distributor', 'hinglish');
    expect(template).toBe(TEMPLATES.mfd_distributor.hinglish);
  });

  it('should return templates for all combinations', () => {
    const leadTypes: LeadType[] = ['mfd_distributor', 'insurance_agent', 'sub_broker', 'unknown'];
    const languages: Language[] = ['hindi', 'hinglish', 'english'];

    leadTypes.forEach(leadType => {
      languages.forEach(language => {
        const template = selectTemplate(leadType, language);
        expect(template).toBe(TEMPLATES[leadType][language]);
      });
    });
  });
});

// ============================================================================
// UNIT TESTS - interpolateName()
// ============================================================================

describe('interpolateName()', () => {
  it('should replace {name} placeholder with actual name', () => {
    const template = 'Hello {name}, welcome!';
    expect(interpolateName(template, 'Rajesh')).toBe('Hello Rajesh, welcome!');
  });

  it('should handle multiple {name} placeholders', () => {
    const template = 'Hi {name}, this is for {name}';
    expect(interpolateName(template, 'Priya')).toBe('Hi Priya, this is for Priya');
  });

  it('should preserve original name casing', () => {
    const template = 'Hello {name}';
    expect(interpolateName(template, 'RAJESH')).toBe('Hello RAJESH');
    expect(interpolateName(template, 'rajesh')).toBe('Hello rajesh');
    expect(interpolateName(template, 'Rajesh Kumar')).toBe('Hello Rajesh Kumar');
  });

  it('should remove {name} placeholder when name is undefined', () => {
    const template = 'Hello {name}, welcome!';
    expect(interpolateName(template, undefined)).toBe('Hello welcome!');
  });

  it('should remove {name} placeholder when name is empty', () => {
    const template = 'Hello {name}, welcome!';
    expect(interpolateName(template, '')).toBe('Hello welcome!');
    expect(interpolateName(template, '   ')).toBe('Hello welcome!');
  });

  it('should handle names with special characters', () => {
    const template = 'Hello {name}';
    expect(interpolateName(template, "O'Brien")).toBe("Hello O'Brien");
    expect(interpolateName(template, 'Jean-Pierre')).toBe('Hello Jean-Pierre');
    expect(interpolateName(template, 'José')).toBe('Hello José');
  });

  it('should handle very long names', () => {
    const template = 'Hello {name}';
    const longName = 'A'.repeat(100);
    expect(interpolateName(template, longName)).toBe(`Hello ${longName}`);
  });
});

// ============================================================================
// UNIT TESTS - selectScriptSource()
// ============================================================================

describe('selectScriptSource()', () => {
  it('should return custom when callScript exists', () => {
    expect(selectScriptSource({ callScript: 'Custom script' })).toBe('custom');
  });

  it('should return template when callScript is missing', () => {
    expect(selectScriptSource({})).toBe('template');
    expect(selectScriptSource({ callScript: undefined })).toBe('template');
  });

  it('should return template when callScript is empty', () => {
    expect(selectScriptSource({ callScript: '' })).toBe('template');
    expect(selectScriptSource({ callScript: '   ' })).toBe('template');
  });
});

// ============================================================================
// UNIT TESTS - getStartingScript()
// ============================================================================

describe('getStartingScript()', () => {
  it('should return custom script when provided', () => {
    const leadProfile: LeadProfile = {
      callScript: 'This is a custom opening line',
      name: 'Rajesh',
    };
    expect(getStartingScript(leadProfile)).toBe('This is a custom opening line');
  });

  it('should interpolate name in custom script', () => {
    const leadProfile: LeadProfile = {
      callScript: 'Hello {name}, custom message',
      name: 'Priya',
    };
    expect(getStartingScript(leadProfile)).toBe('Hello Priya, custom message');
  });

  it('should return template-based script for MFD', () => {
    const leadProfile: LeadProfile = {
      occupation: 'MFD',
      language: 'hinglish',
    };
    const result = getStartingScript(leadProfile);
    expect(result).toContain('Rupeezy');
    expect(result).toContain('brokerage');
  });

  it('should return fallback for null input', () => {
    expect(getStartingScript(null)).toBe(FALLBACK_SCRIPT);
  });

  it('should return fallback for undefined input', () => {
    expect(getStartingScript(undefined)).toBe(FALLBACK_SCRIPT);
  });

  it('should handle empty lead profile', () => {
    const result = getStartingScript({});
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should default to hinglish when language is not specified', () => {
    const leadProfile: LeadProfile = {
      occupation: 'MFD',
    };
    const result = getStartingScript(leadProfile);
    const devanagariRegex = /[\u0900-\u097F]/;
    expect(result).not.toMatch(devanagariRegex);
  });
});

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

// Test data generators
const validLeadProfileArb = fc.record({
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  occupation: fc.option(fc.constantFrom('MFD', 'distributor', 'insurance agent', 'sub-broker', 'other', '')),
  background: fc.option(fc.string({ maxLength: 100 })),
  language: fc.option(fc.constantFrom('hindi', 'hinglish', 'english')),
  callScript: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
});

describe('Property-Based Tests', () => {
  // Property 1: Custom Script Priority
  it('Property 1: Custom Script Priority', () => {
    // Feature: starting-script-service, Property 1: Custom script priority
    fc.assert(
      fc.property(
        fc.record({
          callScript: fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length >= 5),
          name: fc.option(fc.string({ minLength: 1, maxLength: 50 }).map(s => s.trim()).filter(s => s.length > 0)),
          occupation: fc.option(fc.string()),
          language: fc.option(fc.constantFrom('hindi', 'hinglish', 'english')),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          // The key property: when callScript is provided, we don't use templates
          // Result should be derived from callScript, not from TEMPLATES
          const isFromTemplate = Object.values(TEMPLATES).some(leadTypeTemplates =>
            Object.values(leadTypeTemplates).some(template => result === template)
          );
          // If result matches a template exactly, that's a violation of custom script priority
          return !isFromTemplate;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 2: Name Interpolation in Custom Scripts
  it('Property 2: Name Interpolation in Custom Scripts', () => {
    // Feature: starting-script-service, Property 2: Name interpolation in custom scripts
    fc.assert(
      fc.property(
        fc.record({
          callScript: fc.constant('Hello {name}, welcome to Rupeezy'),
          name: fc.string({ minLength: 1, maxLength: 50 })
            .filter(s => s.trim().length > 0)
            .map(s => s.trim()), // Trim to avoid whitespace-only names
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          // Check that placeholder is gone
          const noPlaceholder = !result.includes('{name}');
          // Check that the result contains the name (accounting for special chars)
          const nameInResult = result.includes(leadProfile.name!);
          return noPlaceholder && nameInResult;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 3: Lead Type Classification Correctness
  it('Property 3: Lead Type Classification Correctness', () => {
    // Feature: starting-script-service, Property 3: Lead type classification correctness
    fc.assert(
      fc.property(
        fc.constantFrom('MFD', 'distributor', 'insurance agent', 'sub-broker'),
        (occupation) => {
          const leadProfile: LeadProfile = { occupation };
          const leadType = classifyLeadType(leadProfile);
          
          if (occupation.toLowerCase().includes('mfd') || occupation.toLowerCase().includes('distributor')) {
            return leadType === 'mfd_distributor';
          }
          if (occupation.toLowerCase().includes('insurance agent')) {
            return leadType === 'insurance_agent';
          }
          if (occupation.toLowerCase().includes('sub-broker') || occupation.toLowerCase().includes('sub broker')) {
            return leadType === 'sub_broker';
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 4: Unknown Lead Type Default
  it('Property 4: Unknown Lead Type Default', () => {
    // Feature: starting-script-service, Property 4: Unknown lead type default
    fc.assert(
      fc.property(
        fc.string().filter(s => 
          !s.toLowerCase().includes('mfd') &&
          !s.toLowerCase().includes('distributor') &&
          !s.toLowerCase().includes('insurance agent') &&
          !s.toLowerCase().includes('sub-broker') &&
          !s.toLowerCase().includes('sub broker')
        ),
        (occupation) => {
          const leadProfile: LeadProfile = { occupation };
          const leadType = classifyLeadType(leadProfile);
          return leadType === 'unknown';
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 9: Name Interpolation in Templates
  it('Property 9: Name Interpolation in Templates', () => {
    // Feature: starting-script-service, Property 9: Name interpolation in templates
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constantFrom('hindi', 'hinglish', 'english'),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          // Name should not appear as placeholder
          return !result.includes('{name}');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 10: Graceful Name Omission
  it('Property 10: Graceful Name Omission', () => {
    // Feature: starting-script-service, Property 10: Graceful name omission
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constantFrom('hindi', 'hinglish', 'english'),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          // Should not contain placeholder artifacts
          return !result.includes('{name}') && result.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 11: Hindi Language Selection
  it('Property 11: Hindi Language Selection', () => {
    // Feature: starting-script-service, Property 11: Hindi language selection
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constant('hindi' as Language),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          const devanagariRegex = /[\u0900-\u097F]/;
          return devanagariRegex.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 12: Hinglish Language Selection
  it('Property 12: Hinglish Language Selection', () => {
    // Feature: starting-script-service, Property 12: Hinglish language selection
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constant('hinglish' as Language),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          const devanagariRegex = /[\u0900-\u097F]/;
          return !devanagariRegex.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 13: English Language Selection
  it('Property 13: English Language Selection', () => {
    // Feature: starting-script-service, Property 13: English language selection
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constant('english' as Language),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          const devanagariRegex = /[\u0900-\u097F]/;
          return !devanagariRegex.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 14: Default Language Fallback
  it('Property 14: Default Language Fallback', () => {
    // Feature: starting-script-service, Property 14: Default language fallback
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          // Should default to hinglish (no Devanagari)
          const devanagariRegex = /[\u0900-\u097F]/;
          return !devanagariRegex.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: Rupeezy Brand Mention
  it('Property 16: Rupeezy Brand Mention', () => {
    // Feature: starting-script-service, Property 16: Rupeezy brand mention
    fc.assert(
      fc.property(
        fc.record({
          occupation: fc.constantFrom('MFD', 'insurance agent', 'sub-broker', 'other'),
          language: fc.constantFrom('hindi', 'hinglish', 'english'),
        }),
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          return result.includes('Rupeezy');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 17: Opening Line Length Constraint
  it('Property 17: Opening Line Length Constraint', () => {
    // Feature: starting-script-service, Property 17: Opening line length constraint
    fc.assert(
      fc.property(
        validLeadProfileArb,
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          const wordCount = result.split(/\s+/).length;
          return wordCount <= 50;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 18: Performance Constraint
  it('Property 18: Performance Constraint', () => {
    // Feature: starting-script-service, Property 18: Performance constraint
    fc.assert(
      fc.property(
        validLeadProfileArb,
        (leadProfile) => {
          const start = performance.now();
          getStartingScript(leadProfile);
          const duration = performance.now() - start;
          return duration < 100;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 19: Always Returns Valid String
  it('Property 19: Always Returns Valid String', () => {
    // Feature: starting-script-service, Property 19: Always returns valid string
    fc.assert(
      fc.property(
        validLeadProfileArb,
        (leadProfile) => {
          const result = getStartingScript(leadProfile);
          return typeof result === 'string' && result.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 20: Fallback for Invalid Input
  it('Property 20: Fallback for Invalid Input', () => {
    // Feature: starting-script-service, Property 20: Fallback for invalid input
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        (invalidInput) => {
          const result = getStartingScript(invalidInput);
          return result === FALLBACK_SCRIPT;
        }
      ),
      { numRuns: 100 }
    );
  });
});
