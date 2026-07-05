/**
 * scripts/seedVectors.ts
 * ----------------------
 * Standalone script to seed the `security_rules` table with standard
 * OWASP Top 10 and CWE secure coding practices.
 * 
 * Run with: npm run seed:rules
 */

import { generateEmbedding } from '../src/utils/embeddings';
import { supabase } from '../src/config/supabase';

// A sample dataset of OWASP Top 10 and common CWEs
const securityRules = [
  {
    rule_id: 'OWASP-A01-2021',
    title: 'Broken Access Control',
    content: 'Access control enforces policy such that users cannot act outside of their intended permissions. Failures typically lead to unauthorized information disclosure, modification, or destruction of all data or performing a business function outside the user\'s limits. Remediation: Deny by default, implement access control mechanisms once and re-use them throughout the application.',
    severity: 'critical',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-284',
  },
  {
    rule_id: 'OWASP-A02-2021',
    title: 'Cryptographic Failures',
    content: 'The first thing is to determine the protection needs of data in transit and at rest. Passwords, credit card numbers, health records, personal information, and business secrets require extra protection. Remediation: Encrypt all sensitive data at rest and in transit. Use strong, up-to-date standard algorithms, protocols, and keys. Disable caching for responses that contain sensitive data.',
    severity: 'high',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-310',
  },
  {
    rule_id: 'OWASP-A03-2021',
    title: 'Injection',
    content: 'Injection flaws, such as SQL, NoSQL, OS, and LDAP injection, occur when untrusted data is sent to an interpreter as part of a command or query. The attacker\'s hostile data can trick the interpreter into executing unintended commands or accessing data without proper authorization. Remediation: Use safe APIs (parameterized queries or ORMs). Use positive server-side input validation. Escape special characters.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-89',
  },
  {
    rule_id: 'CWE-79',
    title: 'Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)',
    content: 'The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users. This leads to XSS vulnerabilities. Remediation: Use context-aware output encoding. Use a modern web framework that automatically escapes XSS by design (e.g., React, Angular). Implement Content Security Policy (CSP).',
    severity: 'high',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-79',
  },
  {
    rule_id: 'CWE-22',
    title: 'Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)',
    content: 'The software uses external input to construct a pathname that is intended to identify a file or directory that is located underneath a restricted parent directory, but the software does not properly neutralize special elements within the pathname that can cause the pathname to resolve to a location that is outside of the restricted directory. Remediation: Validate input against an allow-list of permitted values. Do not expose direct file paths to users.',
    severity: 'high',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-22',
  }
];

async function seed() {
  console.log('🌱 Starting Knowledge Base Seeding...');

  for (const rule of securityRules) {
    console.log(`Processing rule: ${rule.rule_id} - ${rule.title}`);
    
    // Combine title and content for a richer embedding representation
    const textToEmbed = `Title: ${rule.title}\nContent: ${rule.content}\nSeverity: ${rule.severity}`;
    
    try {
      const embedding = await generateEmbedding(textToEmbed);

      const { error } = await supabase
        .from('security_rules')
        .upsert({
          rule_id: rule.rule_id,
          title: rule.title,
          content: rule.content,
          severity: rule.severity,
          owasp_category: rule.owasp_category,
          cwe_id: rule.cwe_id,
          embedding: embedding, // pgvector handles the array of numbers automatically
        }, {
          onConflict: 'rule_id'
        });

      if (error) {
        console.error(`❌ Failed to insert rule ${rule.rule_id}:`, error.message);
      } else {
        console.log(`✅ Successfully seeded rule ${rule.rule_id}`);
      }
    } catch (err: any) {
      console.error(`❌ Error generating embedding for ${rule.rule_id}:`, err.message);
    }
  }

  console.log('🏁 Seeding complete.');
}

// Execute the seeding script
seed().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
