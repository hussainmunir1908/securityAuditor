import { parseVulnerabilityBlocks } from '../analyzer';

describe('parseVulnerabilityBlocks', () => {
  it('should parse a single valid vulnerability block', () => {
    const raw = `
VULNERABILITY: CWE-89 SQL Injection
SEVERITY: CRITICAL
CVSS: 9.8
ATTACK: The username parameter is concatenated directly into the SQL query without parameterization.
FIX:
Use parameterized queries or an ORM like Prisma.
`;
    const findings = parseVulnerabilityBlocks(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule_id: 'CWE-89',
      cwe_id: 'CWE-89',
      severity: 'critical',
      confidence: 0.98,
      description: 'The username parameter is concatenated directly into the SQL query without parameterization.',
      remediation: 'Use parameterized queries or an ORM like Prisma.',
    });
  });

  it('should parse multiple vulnerability blocks separated by blank lines', () => {
    const raw = `
VULNERABILITY: CWE-79 Cross-Site Scripting
SEVERITY: HIGH
CVSS: 7.5
ATTACK: The user input 'q' is reflected directly into the HTML without encoding.
FIX:
Use DOMPurify to sanitize the input before rendering.

VULNERABILITY: OWASP-A03 Sensitive Data Exposure
SEVERITY: LOW
CVSS: 3.1
ATTACK: An API key is hardcoded in the frontend script.
FIX:
Move the API key to an environment variable and access it securely.
`;
    const findings = parseVulnerabilityBlocks(raw);
    expect(findings).toHaveLength(2);
    
    expect(findings[0]).toMatchObject({
      rule_id: 'CWE-79',
      cwe_id: 'CWE-79',
      severity: 'high',
      confidence: 0.75,
      description: 'The user input \'q\' is reflected directly into the HTML without encoding.',
      remediation: 'Use DOMPurify to sanitize the input before rendering.',
    });

    expect(findings[1]).toMatchObject({
      rule_id: 'OWASP-A03',
      cwe_id: null, // OWASP-A03 doesn't match CWE-\d+
      severity: 'low',
      confidence: 0.31,
      description: 'An API key is hardcoded in the frontend script.',
      remediation: 'Move the API key to an environment variable and access it securely.',
    });
  });

  it('should return empty array for "NONE"', () => {
    expect(parseVulnerabilityBlocks('NONE')).toEqual([]);
    expect(parseVulnerabilityBlocks('   NONE   \n')).toEqual([]);
  });

  it('should handle malformed blocks gracefully by skipping them', () => {
    const raw = `
VULNERABILITY: CWE-123 Malformed
SEVERITY: HIGH
CVSS: 9.9
ATTACK: Missing FIX block!

VULNERABILITY: CWE-456 Valid Block
SEVERITY: LOW
CVSS: 2.0
ATTACK: This block is perfectly fine.
FIX:
Do this instead.
`;
    // The first block is missing FIX, so it should be skipped.
    const findings = parseVulnerabilityBlocks(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule_id).toBe('CWE-456');
  });

  it('should default to "medium" for unrecognized severities', () => {
    const raw = `
VULNERABILITY: WEIRD-1 Unknown Severity
SEVERITY: APOCALYPTIC
CVSS: 10.0
ATTACK: Something very bad.
FIX:
Run.
`;
    const findings = parseVulnerabilityBlocks(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('should handle missing or malformed CVSS gracefully', () => {
    const raw = `
VULNERABILITY: BAD-CVSS Missing Score
SEVERITY: HIGH
CVSS: Not a number
ATTACK: Something bad.
FIX:
Fix it.
`;
    const findings = parseVulnerabilityBlocks(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBeNull();
  });
});
