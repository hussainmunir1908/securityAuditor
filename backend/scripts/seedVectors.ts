/**
 * scripts/seedVectors.ts
 * ----------------------
 * Standalone admin script to seed the `security_rules` table with comprehensive
 * OWASP Top 10 (2021), CWE, and pattern-specific security rules.
 *
 * Uses the Supabase SERVICE ROLE key to bypass RLS (required for admin inserts).
 * Uses the Hugging Face Inference API for 384-dimensional embeddings.
 *
 * Run with:  npm run seed:rules
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv') as typeof import('dotenv');

const envResult = dotenv.config({ path: path.resolve(__dirname, '../../.env') });
if (envResult.error) {
  console.error('❌ Failed to load .env file:', envResult.error.message);
  process.exit(1);
}

const SUPABASE_URL        = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_ROLE_KEY    = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const HF_KEY              = process.env['HUGGING_FACE_API_KEY'];

if (!SUPABASE_URL) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!HF_KEY) {
  console.warn('⚠️  HUGGING_FACE_API_KEY not set — will store mock (zero) embeddings.');
}

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../src/utils/embeddings';

const adminSupabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

// ─── Security Rules Dataset ───────────────────────────────────────────────────
const securityRules = [
  // ════════════════════════════════════════════════════════════════════════════
  // OWASP Top 10 (2021)
  // ════════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'OWASP-A01-2021',
    title: 'Broken Access Control',
    content:
      'Access control enforces policy such that users cannot act outside of their intended permissions. ' +
      'Failures typically lead to unauthorized information disclosure, modification, or destruction of all data. ' +
      'Common weaknesses: bypassing access control checks by modifying the URL or API request, viewing or editing ' +
      'another user\'s account by providing its unique identifier (IDOR), privilege escalation, CORS misconfiguration, ' +
      'missing access control on API endpoints. ' +
      'CODE PATTERNS TO DETECT: Missing authorization middleware on routes, direct object references without ownership checks, ' +
      'accessing resources by ID without verifying the requesting user owns them, missing role-based access control. ' +
      'Remediation: Deny by default; implement access control as a centralized mechanism; log access control failures; ' +
      'invalidate JWT tokens server-side; enforce record ownership checks.',
    severity: 'critical',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-284',
  },
  {
    rule_id: 'OWASP-A02-2021',
    title: 'Cryptographic Failures',
    content:
      'Cryptographic failures expose sensitive data due to weak or missing encryption. ' +
      'CODE PATTERNS TO DETECT: Using MD5 or SHA-1 for password hashing, hardcoded encryption keys or salts, ' +
      'transmitting passwords or tokens in cleartext (HTTP instead of HTTPS), using Math.random() for security-sensitive operations, ' +
      'storing passwords in plaintext, using weak cipher modes (ECB), missing TLS configuration. ' +
      'Remediation: Use AES-256 for encryption at rest; use TLS 1.2+ in transit; store passwords with Argon2id, bcrypt, or PBKDF2; ' +
      'use crypto.randomBytes() instead of Math.random() for security operations.',
    severity: 'high',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-310',
  },
  {
    rule_id: 'OWASP-A03-2021',
    title: 'Injection',
    content:
      'Injection flaws occur when hostile data is sent to an interpreter as part of a command or query. ' +
      'CODE PATTERNS TO DETECT: String concatenation in SQL queries (e.g. "SELECT * FROM users WHERE id = " + userId), ' +
      'using template literals in SQL without parameterization, unsanitized user input in shell commands (child_process.exec), ' +
      'eval() with user input, RegExp constructed from user input, LDAP injection, XPath injection, ' +
      'using raw MongoDB queries with user input ($where, $regex). ' +
      'Remediation: Use parameterized queries or ORMs; validate and sanitize all user input server-side; ' +
      'use allow-lists for expected values; escape special characters.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-89',
  },
  {
    rule_id: 'OWASP-A04-2021',
    title: 'Insecure Design',
    content:
      'Insecure design represents the absence of security controls in the application architecture. ' +
      'CODE PATTERNS TO DETECT: No rate limiting on login or API endpoints, missing input validation schemas, ' +
      'no CSRF protection on state-changing operations, business logic flaws allowing unlimited operations, ' +
      'lack of defense-in-depth (single point of failure for auth). ' +
      'Remediation: Use threat modelling; implement rate limiting; validate all inputs with schemas (Joi, Zod); ' +
      'add CSRF tokens to all forms.',
    severity: 'high',
    owasp_category: 'A04:2021-Insecure Design',
    cwe_id: 'CWE-657',
  },
  {
    rule_id: 'OWASP-A05-2021',
    title: 'Security Misconfiguration',
    content:
      'Security misconfiguration includes missing hardening, improper permissions, unnecessary features enabled, ' +
      'default accounts with unchanged passwords, overly informative error messages, missing security headers. ' +
      'CODE PATTERNS TO DETECT: Debug mode enabled in production (DEBUG=true), stack traces exposed to users, ' +
      'CORS set to "*" (allow all origins), missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options), ' +
      'default or weak configuration values, directory listing enabled, verbose error messages in responses. ' +
      'Remediation: Automate hardening; remove default accounts; set appropriate CORS origins; add security headers; ' +
      'disable debug mode in production.',
    severity: 'medium',
    owasp_category: 'A05:2021-Security Misconfiguration',
    cwe_id: 'CWE-16',
  },
  {
    rule_id: 'OWASP-A06-2021',
    title: 'Vulnerable and Outdated Components',
    content:
      'Applications using outdated components with known CVEs. ' +
      'CODE PATTERNS TO DETECT: Using deprecated/vulnerable npm packages, importing known-vulnerable library versions, ' +
      'using deprecated Node.js APIs (url.parse, new Buffer()). ' +
      'Remediation: Remove unused dependencies; continuously inventory versions; obtain from official sources.',
    severity: 'medium',
    owasp_category: 'A06:2021-Vulnerable and Outdated Components',
    cwe_id: 'CWE-1104',
  },
  {
    rule_id: 'OWASP-A07-2021',
    title: 'Identification and Authentication Failures',
    content:
      'Authentication failures allow attackers to assume other users\' identities. ' +
      'CODE PATTERNS TO DETECT: No password complexity requirements, missing brute force protection (no rate limiting on login), ' +
      'session tokens in URLs, JWT tokens that never expire, passwords stored in plaintext or with weak hashing, ' +
      'missing multi-factor authentication on critical operations, session fixation vulnerabilities. ' +
      'Remediation: Implement MFA; ban known-breached passwords; rate-limit login attempts; use secure session management.',
    severity: 'critical',
    owasp_category: 'A07:2021-Identification and Authentication Failures',
    cwe_id: 'CWE-287',
  },
  {
    rule_id: 'OWASP-A08-2021',
    title: 'Software and Data Integrity Failures',
    content:
      'Integrity failures relate to code and infrastructure that does not protect against integrity violations. ' +
      'CODE PATTERNS TO DETECT: Insecure deserialization (JSON.parse of untrusted data without validation, pickle.loads, ' +
      'PHP unserialize), loading scripts from CDNs without integrity attributes (SRI), auto-updates without verification. ' +
      'Remediation: Use digital signatures; verify checksums; never deserialize untrusted data without validation.',
    severity: 'high',
    owasp_category: 'A08:2021-Software and Data Integrity Failures',
    cwe_id: 'CWE-494',
  },
  {
    rule_id: 'OWASP-A09-2021',
    title: 'Security Logging and Monitoring Failures',
    content:
      'Insufficient logging and monitoring allows attackers to persist and move laterally. ' +
      'CODE PATTERNS TO DETECT: No logging of authentication events, missing error logging, logging sensitive data ' +
      '(passwords, tokens, PII) in plaintext, no rate limiting alerts, catch blocks that silently swallow errors. ' +
      'Remediation: Log all login/access/validation failures; use structured logging; never log sensitive data.',
    severity: 'medium',
    owasp_category: 'A09:2021-Security Logging and Monitoring Failures',
    cwe_id: 'CWE-778',
  },
  {
    rule_id: 'OWASP-A10-2021',
    title: 'Server-Side Request Forgery (SSRF)',
    content:
      'SSRF flaws occur when an application fetches a remote resource without validating the user-supplied URL. ' +
      'CODE PATTERNS TO DETECT: Using fetch/axios/http.get with user-controlled URLs without validation, ' +
      'allowing access to internal services (localhost, 127.0.0.1, 169.254.169.254 for cloud metadata), ' +
      'URL redirects controlled by user input. ' +
      'Remediation: Sanitize and validate all client-supplied URLs; use an allow-list; block private IP ranges.',
    severity: 'high',
    owasp_category: 'A10:2021-Server-Side Request Forgery',
    cwe_id: 'CWE-918',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Specific CWEs & Vulnerability Patterns
  // ════════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'CWE-79',
    title: 'Cross-Site Scripting (XSS)',
    content:
      'XSS occurs when an application includes unvalidated user-supplied data in a web page. ' +
      'CODE PATTERNS TO DETECT: Using innerHTML or dangerouslySetInnerHTML with user input, ' +
      'document.write() with dynamic content, template engines without auto-escaping (e.g. <%- %> in EJS), ' +
      'rendering user input directly in HTML without encoding, using jQuery .html() with user data. ' +
      'Remediation: Use context-aware output encoding; use frameworks that escape by default (React, Angular); ' +
      'implement a strict CSP; set HttpOnly and SameSite cookie attributes.',
    severity: 'high',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-79',
  },
  {
    rule_id: 'CWE-22',
    title: 'Path Traversal',
    content:
      'Path traversal occurs when user-supplied input constructs file paths with "../" sequences. ' +
      'CODE PATTERNS TO DETECT: fs.readFile/fs.writeFile with user-controlled paths, ' +
      'path.join() or path.resolve() with unsanitized user input, serving static files based on user parameters, ' +
      'using req.params or req.query directly in file system operations. ' +
      'Remediation: Validate and canonicalize paths; verify resolved path starts with expected root; use allow-lists.',
    severity: 'high',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-22',
  },
  {
    rule_id: 'CWE-798',
    title: 'Use of Hard-coded Credentials',
    content:
      'Hard-coded credentials embedded in source code provide permanent backdoor access. ' +
      'CODE PATTERNS TO DETECT: Strings matching patterns like "password = \'...\'" or "apiKey = \'...\'" in code, ' +
      'AWS access keys (AKIA...), GitHub tokens (ghp_...), database connection strings with passwords, ' +
      'JWT secrets as string literals, API keys or tokens assigned to variables directly in source files. ' +
      'Remediation: Store secrets in environment variables or a secrets manager; scan repos with git-secrets; never commit keys.',
    severity: 'critical',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-798',
  },
  {
    rule_id: 'CWE-502',
    title: 'Deserialization of Untrusted Data',
    content:
      'Deserializing data from untrusted sources can lead to remote code execution. ' +
      'CODE PATTERNS TO DETECT: JSON.parse() of user input without schema validation, ' +
      'Python pickle.loads() on untrusted data, PHP unserialize() on user input, ' +
      'Java ObjectInputStream on network data, YAML.load() without safe mode. ' +
      'Remediation: Never deserialize untrusted data; use JSON with strict schema validation (Zod, Joi); ' +
      'run deserialization in isolated environments.',
    severity: 'critical',
    owasp_category: 'A08:2021-Software and Data Integrity Failures',
    cwe_id: 'CWE-502',
  },
  {
    rule_id: 'CWE-611',
    title: 'XML External Entity (XXE) Injection',
    content:
      'XXE occurs when an XML parser processes external entity references in user-controlled XML. ' +
      'CODE PATTERNS TO DETECT: XML parsing without disabling external entities, ' +
      'libxml2 without NOENT flag, DOMParser on untrusted XML, xml2js without strict mode. ' +
      'Remediation: Disable external entity processing; use JSON instead of XML; patch XML libraries.',
    severity: 'high',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-611',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Pattern-Specific Rules (NEW)
  // ════════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'SEC-EVAL',
    title: 'Dangerous Use of eval() or Function()',
    content:
      'Using eval(), new Function(), or setTimeout/setInterval with strings allows arbitrary code execution. ' +
      'CODE PATTERNS TO DETECT: eval(userInput), new Function(userInput), setTimeout(stringArg, ...), ' +
      'vm.runInNewContext with user data, child_process.exec with string interpolation. ' +
      'Remediation: Never use eval() with dynamic content; use JSON.parse() for data; use child_process.execFile() ' +
      'with explicit argument arrays instead of shell string interpolation.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-95',
  },
  {
    rule_id: 'SEC-CMD-INJECTION',
    title: 'Command Injection via child_process',
    content:
      'Command injection occurs when user input is passed to shell commands without proper sanitization. ' +
      'CODE PATTERNS TO DETECT: child_process.exec() with template literals or string concatenation containing user input, ' +
      'shell: true option in spawn/execSync, os.system() in Python with user input, backtick commands in Ruby. ' +
      'Remediation: Use execFile() or spawn() without shell:true; pass arguments as arrays; validate input against allow-lists.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-78',
  },
  {
    rule_id: 'SEC-CSRF',
    title: 'Missing CSRF Protection',
    content:
      'Cross-Site Request Forgery allows attackers to perform actions on behalf of authenticated users. ' +
      'CODE PATTERNS TO DETECT: POST/PUT/DELETE routes without CSRF token validation, forms without CSRF hidden fields, ' +
      'APIs accepting credentials via cookies without additional CSRF protection, missing SameSite cookie attribute. ' +
      'Remediation: Use CSRF tokens (csurf middleware); set SameSite=Strict on session cookies; verify Origin/Referer headers.',
    severity: 'high',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-352',
  },
  {
    rule_id: 'SEC-SQLI-CONCAT',
    title: 'SQL Injection via String Concatenation',
    content:
      'Building SQL queries by concatenating user input directly into query strings. ' +
      'CODE PATTERNS TO DETECT: "SELECT * FROM " + table + " WHERE id = " + id, ' +
      'template literals in SQL: `SELECT * FROM users WHERE email = \'${email}\'`, ' +
      'db.query("DELETE FROM " + req.body.table), cursor.execute(f"SELECT {column} FROM users"). ' +
      'Remediation: ALWAYS use parameterized queries or prepared statements; use an ORM like Prisma, Sequelize, or SQLAlchemy.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-89',
  },
  {
    rule_id: 'SEC-INSECURE-RANDOM',
    title: 'Insecure Randomness for Security Operations',
    content:
      'Using Math.random() or similar weak PRNGs for security-sensitive operations like token generation. ' +
      'CODE PATTERNS TO DETECT: Math.random() used for session tokens, OTP codes, password reset tokens, CSRF tokens, ' +
      'or encryption keys; random.random() in Python for security purposes. ' +
      'Remediation: Use crypto.randomBytes() in Node.js or secrets module in Python for security-sensitive randomness.',
    severity: 'high',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-330',
  },
  {
    rule_id: 'SEC-OPEN-REDIRECT',
    title: 'Open Redirect',
    content:
      'Open redirect occurs when an application redirects to a URL controlled by user input without validation. ' +
      'CODE PATTERNS TO DETECT: res.redirect(req.query.url), window.location = userInput, ' +
      'Location header set from user parameter, response.sendRedirect(request.getParameter("url")). ' +
      'Remediation: Validate redirect URLs against an allow-list of domains; use relative paths only; ' +
      'never redirect to user-supplied absolute URLs.',
    severity: 'medium',
    owasp_category: 'A01:2021-Broken Access Control',
    cwe_id: 'CWE-601',
  },
  {
    rule_id: 'SEC-INSECURE-COOKIE',
    title: 'Insecure Cookie Configuration',
    content:
      'Cookies carrying session tokens or sensitive data without proper security flags. ' +
      'CODE PATTERNS TO DETECT: Setting cookies without httpOnly flag, missing secure flag on session cookies, ' +
      'missing sameSite attribute, cookie expiration set too far in the future, domain set too broadly. ' +
      'Remediation: Set httpOnly: true, secure: true, sameSite: "strict" or "lax" on all session cookies.',
    severity: 'medium',
    owasp_category: 'A05:2021-Security Misconfiguration',
    cwe_id: 'CWE-614',
  },
  {
    rule_id: 'SEC-INFO-DISCLOSURE',
    title: 'Information Disclosure via Error Messages',
    content:
      'Exposing stack traces, database errors, or internal paths to end users. ' +
      'CODE PATTERNS TO DETECT: Sending err.stack or err.message directly in HTTP responses, ' +
      'console.log of sensitive data in production, exposing SQL error details to clients, ' +
      'returning full exception objects in API responses. ' +
      'Remediation: Use generic error messages for clients; log detailed errors server-side only; ' +
      'implement a global error handler that sanitizes responses.',
    severity: 'medium',
    owasp_category: 'A05:2021-Security Misconfiguration',
    cwe_id: 'CWE-209',
  },
  {
    rule_id: 'SEC-NO-RATE-LIMIT',
    title: 'Missing Rate Limiting',
    content:
      'Endpoints handling authentication, password reset, or payment without rate limiting are vulnerable to abuse. ' +
      'CODE PATTERNS TO DETECT: Login routes without rate-limiting middleware, password reset endpoints without throttling, ' +
      'API endpoints with no request rate limits, OTP verification without attempt limits. ' +
      'Remediation: Implement rate limiting (express-rate-limit); use CAPTCHA on login; limit OTP attempts.',
    severity: 'medium',
    owasp_category: 'A04:2021-Insecure Design',
    cwe_id: 'CWE-770',
  },
  {
    rule_id: 'SEC-PROTOTYPE-POLLUTION',
    title: 'Prototype Pollution',
    content:
      'Prototype pollution occurs when an attacker injects properties into JavaScript object prototypes. ' +
      'CODE PATTERNS TO DETECT: Deep merge/extend functions without prototype checks, Object.assign with user input, ' +
      'lodash.merge or _.defaultsDeep with untrusted data, recursive object copy without __proto__ filtering. ' +
      'Remediation: Freeze prototypes (Object.freeze(Object.prototype)); validate input keys; use Map instead of objects; ' +
      'update lodash and similar libraries to patched versions.',
    severity: 'high',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-1321',
  },
  {
    rule_id: 'SEC-FILE-UPLOAD',
    title: 'Insecure File Upload',
    content:
      'Allowing file uploads without proper validation can lead to remote code execution or stored XSS. ' +
      'CODE PATTERNS TO DETECT: File upload without type/extension validation, saving uploaded files to publicly ' +
      'accessible directories, using original filename without sanitization, no file size limits, ' +
      'allowing executable file types (.php, .jsp, .exe, .sh). ' +
      'Remediation: Validate file type by magic bytes (not just extension); store outside webroot; generate random filenames; ' +
      'enforce size limits; scan for malware.',
    severity: 'high',
    owasp_category: 'A04:2021-Insecure Design',
    cwe_id: 'CWE-434',
  },
  {
    rule_id: 'SEC-CORS-WILDCARD',
    title: 'CORS Misconfiguration — Wildcard Origin',
    content:
      'Setting Access-Control-Allow-Origin to * allows any website to make requests to the API. ' +
      'CODE PATTERNS TO DETECT: cors({ origin: "*" }), cors() with no origin restriction, ' +
      'res.setHeader("Access-Control-Allow-Origin", "*"), reflecting the Origin header without validation. ' +
      'Remediation: Specify exact allowed origins; never use wildcard with credentials; validate Origin against allow-list.',
    severity: 'high',
    owasp_category: 'A05:2021-Security Misconfiguration',
    cwe_id: 'CWE-942',
  },
  {
    rule_id: 'SEC-NOSQL-INJECTION',
    title: 'NoSQL Injection',
    content:
      'NoSQL injection occurs when user input is passed directly into MongoDB or similar database queries. ' +
      'CODE PATTERNS TO DETECT: db.collection.find({ email: req.body.email }) without sanitization, ' +
      'using $where with user input, $regex from user data, $gt/$ne/$or from unsanitized request body. ' +
      'Remediation: Validate and sanitize all inputs; use mongoose with schema validation; ' +
      'reject objects with $ operators from user input.',
    severity: 'critical',
    owasp_category: 'A03:2021-Injection',
    cwe_id: 'CWE-943',
  },
  {
    rule_id: 'SEC-WEAK-HASH',
    title: 'Weak Password Hashing',
    content:
      'Using weak or fast hashing algorithms for password storage. ' +
      'CODE PATTERNS TO DETECT: md5(password), sha1(password), sha256 without key stretching, ' +
      'crypto.createHash("md5") for passwords, hashlib.md5() for credentials. ' +
      'Remediation: Use bcrypt, scrypt, or Argon2id for password hashing with appropriate work factors.',
    severity: 'critical',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-916',
  },
  {
    rule_id: 'SEC-JWT-NONE',
    title: 'JWT Algorithm Confusion / None Algorithm',
    content:
      'JWT vulnerabilities where the algorithm can be manipulated or the "none" algorithm is accepted. ' +
      'CODE PATTERNS TO DETECT: jwt.verify without specifying algorithms option, accepting "none" algorithm, ' +
      'jwt.decode() used for authorization (does not verify signature), symmetric key with RS256. ' +
      'Remediation: Always specify algorithms: ["HS256"] or ["RS256"] in verify options; never use jwt.decode() for auth.',
    severity: 'critical',
    owasp_category: 'A02:2021-Cryptographic Failures',
    cwe_id: 'CWE-327',
  },
];

// ─── Seeding Logic ─────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('🌱 Starting Knowledge Base Seeding...');
  console.log(`   Model  : sentence-transformers/all-MiniLM-L6-v2 (384-dim)`);
  console.log(`   Client : Supabase service_role (RLS bypassed)`);
  console.log(`   Rules  : ${securityRules.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const rule of securityRules) {
    process.stdout.write(`  ⏳ ${rule.rule_id} — ${rule.title}...`);

    const textToEmbed =
      `Title: ${rule.title}\n` +
      `Severity: ${rule.severity}\n` +
      `OWASP Category: ${rule.owasp_category ?? 'N/A'}\n` +
      `CWE: ${rule.cwe_id ?? 'N/A'}\n` +
      `Content: ${rule.content}`;

    try {
      const embedding = await generateEmbedding(textToEmbed);

      const { error } = await adminSupabase
        .from('security_rules')
        .upsert(
          {
            rule_id:        rule.rule_id,
            title:          rule.title,
            content:        rule.content,
            severity:       rule.severity,
            owasp_category: rule.owasp_category,
            cwe_id:         rule.cwe_id,
            embedding,
          },
          { onConflict: 'rule_id' }
        );

      if (error) {
        console.error(`\n  ❌ DB error for ${rule.rule_id}:`, error.message);
        failCount++;
      } else {
        console.log(` ✅`);
        successCount++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n  ❌ Embedding error for ${rule.rule_id}: ${message}`);
      failCount++;
    }
  }

  console.log(`\n🏁 Seeding complete. ✅ ${successCount} succeeded  ❌ ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

seed().catch((err: unknown) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
