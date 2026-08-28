import { AiExtraction, AiActionItem } from './aiSchemas';
import { AiExtractionService, ExtractionContext } from './aiService';
import { parseDatePhrase, parseTimePhrase } from './dateTime';

/**
 * Deterministic, offline "AI" extractor used in AI_MODE=dev.
 *
 * A careful rule-based fallback so the whole system works end-to-end with zero
 * API keys. Rules are conservative: unresolved fields stay null and the result
 * is flagged `needsReview`/`gradeAmbiguous` so an administrator can correct it
 * in the review screen. A hosted model (RemoteAiExtractionService) can replace
 * this with AI_MODE=remote and is driven by the SAME Zod validation contract.
 */
export class RuleBasedAiExtractionService implements AiExtractionService {
  readonly provider = 'rule-based-dev';

  isAvailable(): boolean {
    return true;
  }

  async extract(text: string, context: ExtractionContext = {}): Promise<AiExtraction> {
    const today = context.today ?? new Date();
    const raw = text ?? '';

    const grades = this.detectGrades(raw, context.gradeNames);
    const allGrades = grades.length === 0 && this.confidentAllGrades(raw);

    const eventDate = this.firstDate(
      [/(?:on|held on|takes place on|date)\s+([^.,\n]+)/i, /([a-z]+day\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s*\d{0,4})/i, /(\d{4}-\d{1,2}-\d{1,2})/],
      raw,
      today
    );
    const anyEventDate = this.firstDate([/[^.\n]+/i], raw, today);

    const startTime = this.firstTime([/(?:from|starts|at|between)\s+([^.,\n]*\d[\d:]*\s*(?:am|pm)?)/i], raw);
    const endTime = this.firstTime([/(?:to|until|till)\s+([^.,\n]*\d[\d:]*\s*(?:am|pm)?)/i], raw);

    const deadline = this.firstDate(
      [/(?:rsvp|deadline|registrations?\s+close|due|by|before|pay\s+by)\s+([^.,\n]+)/i],
      raw,
      today
    );

    const { amount, currency } = this.detectAmount(raw);
    const requiredItems = this.detectRequiredItems(raw);
    const contactInformation = this.detectContact(raw);

    const registrationRequired = this.hasAny(raw, /register|sign.?up|booking|enrol|rsvp/i) ? true : null;
    const permissionRequired = this.hasAny(raw, /permission|consent\s+form|sign\s+(the\s+)?(form|slip)/i) ? true : null;

    const actionItems = this.buildActionItems({
      raw,
      amount,
      deadline,
      requiredItems,
      permissionRequired,
      registrationRequired,
    });

    const messageType = this.detectMessageType(raw, { allGrades, eventDate, amount });
    const title = this.detectTitle(raw);
    const summary = this.detectSummary(raw);
    const importance = this.detectImportance(raw, messageType);

    const gradeAmbiguous = !allGrades && this.hasAny(raw, /grade|gr\.?|gr\s?\d/i) && grades.length === 0;
    const gradeConfidence = allGrades ? 0.95 : grades.length > 0 ? 0.85 : gradeAmbiguous ? 0.25 : 0.7;

    const needsReview =
      gradeAmbiguous ||
      (messageType === 'EVENT' && !eventDate) ||
      (grades.length === 0 && !allGrades) ||
      (amount !== null && amount > 0 && !deadline && messageType === 'PAYMENT');

    return {
      messageType,
      grades,
      allGrades,
      gradeAmbiguous,
      title,
      summary,
      eventDate,
      startTime,
      endTime,
      location: this.detectLocation(raw) ?? null,
      deadline,
      amount,
      currency,
      requiredItems,
      actionItems,
      contactInformation,
      registrationRequired,
      permissionRequired,
      importance,
      shouldGenerateReminders: true,
      needsReview,
      confidence: {
        overall: needsReview ? 0.4 : 0.85,
        grade: gradeConfidence,
        eventDate: eventDate ? 0.85 : anyEventDate ? 0.4 : 0.5,
        deadline: deadline ? 0.85 : 0.5,
        amount: amount !== null ? 0.9 : 0.5,
      },
    };
  }
// ----------------------------------------------------------------------
  private detectGrades(raw: string, gradeNames?: string[]): string[] {
    const found = new Set<string>();
    const addToken = (tk: string) => {
      const t = tk.toLowerCase();
      const name = t === 'r' ? 'Grade R' : /^\d{1,2}$/.test(t) ? `Grade ${parseInt(t, 10)}` : '';
      if (name) found.add(name);
    };

    // Match each grade keyword occurrence, including plural "Grades X", plus
    // trailing numeric lists ("4 and 5", "4, 5 & 6").
    const kwRe = /\b(?:grades?|gr\.?)\s*([Rr]|\d{1,2})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = kwRe.exec(raw)) !== null) {
      addToken(m[1]);
      const after = raw.slice(m.index + m[0].length);
      const list = after.match(/^(?:\s*(?:,|and|&)\s*([Rr]|\d{1,2}))+/i);
      if (list) for (const tk of list[0].match(/[Rr]|\d{1,2}/g) ?? []) addToken(tk);
    }

    if (gradeNames && gradeNames.length) {
      const allowed = new Set(gradeNames.map((g) => g.toLowerCase()));
      for (const g of [...found]) if (!allowed.has(g.toLowerCase())) found.delete(g);
      // Bail out early when no grades were detected against the configured set,
      // otherwise fall back to a direct name match for safety.
      if (found.size) return [...found].sort((a, b) => gradeNames.indexOf(a) - gradeNames.indexOf(b));
      for (const name of gradeNames) {
        if (new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(raw)) found.add(name);
      }
      if (found.size) return [...found].sort((a, b) => gradeNames.indexOf(a) - gradeNames.indexOf(b));
    }
    return [...found];
  }

  private confidentAllGrades(raw: string): boolean {
    return this.hasAny(raw, /all\s+(parents|students|pupils|grades|learners)/i, /entire school/i, /school community/i, /everyone/i);
  }

  private firstDate(patterns: RegExp[], raw: string, today: Date): string | null {
    for (const re of patterns) {
      const m = raw.match(re);
      if (m && m[1]) {
        const parsed = parseDatePhrase(m[1], today);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  private firstTime(patterns: RegExp[], raw: string): string | null {
    for (const re of patterns) {
      const m = raw.match(re);
      if (m && m[1]) {
        const parsed = parseTimePhrase(m[1]);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  private detectAmount(raw: string): { amount: number | null; currency: string | null } {
    // Word boundary prevents matching the "r" inside words like "September R...
    const m = raw.match(/\bR\s?(\d{1,6}(?:[.,]\d{1,2})?)/i);
    if (m) return { amount: parseFloat(m[1].replace(',', '.')), currency: 'ZAR' };
    return { amount: null, currency: 'ZAR' };
  }

  private detectRequiredItems(raw: string): string[] {
    const items: string[] = [];
    const re = /(?:bring|remember to bring|please bring)[^.,\n]*/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const chunk = m[0].trim();
      if (chunk.length > 8 && chunk.length < 180) items.push(chunk);
    }
    if (items.length === 0) {
      const line = raw.match(/please bring[^\n]*(?:\n|$)/i);
      if (line) {
        const rest = line[0].replace(/please bring\s*/i, '');
        if (rest.length > 2) items.push(rest.trim());
      }
    }
    return items.slice(0, 6);
  }

  private detectContact(raw: string): { name: string | null; phone: string | null; email: string | null } | null {
    const email = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    const phone = raw.match(/(?:\+?\d[\d\s-]{8,}\d)/);
    const nameM = raw.match(/(?:contact|call)\s+([A-Z][a-zA-Z ]{1,40})/i);
    if (!email && !phone && !nameM) return null;
    return {
      name: nameM ? nameM[1].trim().slice(0, 60) : null,
      phone: phone ? phone[0].trim() : null,
      email: email ? email[0] : null,
    };
  }

  private detectLocation(raw: string): string | null {
    const m = raw.match(/(?:at the|in the|venue|held at|located at|meet at)\s+([^.,\n][^0-9]{2,90})/i);
    return m ? m[1].trim() : null;
  }
private buildActionItems(o: {
    raw: string;
    amount: number | null;
    deadline: string | null;
    requiredItems: string[];
    permissionRequired: boolean | null;
    registrationRequired: boolean | null;
  }): AiActionItem[] {
    const items: AiActionItem[] = [];
    if (o.amount && o.amount > 0) {
      items.push({
        type: 'PAY',
        title: o.deadline ? `Pay ${fmtMoney(o.amount)} by ${o.deadline}` : `Pay ${fmtMoney(o.amount)}`,
        amount: o.amount,
        deadline: o.deadline,
      });
    }
    if (o.permissionRequired) items.push({ type: 'SIGN', title: 'Sign the permission slip', deadline: o.deadline });
    if (o.registrationRequired) items.push({ type: 'REGISTER', title: 'Register for the event', deadline: o.deadline });
    for (const item of o.requiredItems) items.push({ type: 'BRING', title: item });
    if (this.hasAny(o.raw, /reply|let us know|respond/i)) {
      items.push({ type: 'REPLY', title: 'Respond to the school', deadline: o.deadline });
    }
    return items.slice(0, 8);
  }

  private detectMessageType(raw: string, ctx: { allGrades: boolean; eventDate: string | null; amount: number | null }): AiExtraction['messageType'] {
    const has = (...re: RegExp[]) => re.some((r) => r.test(raw));
    if (has(/emergency|urgent|attention immediately|danger|severe weather|lockdown/i)) return 'EMERGENCY';
    if (has(/school will be closed|no school|school closed|closure/i)) return 'SCHOOL_CLOSURE';
    if (has(/sports/i) && has(/event|day|tournament|match|game|meet/i)) return 'SPORTS';
    if (has(/trip|excursion|outing|visit to/i)) return 'SCHOOL_TRIP';
    if (has(/pay|payment|fee|due|amount|transfer|eft|bank details|cost/i) && ctx.amount !== null) return 'PAYMENT';
    if (has(/uniform|blazer|school clothing/i)) return 'UNIFORM';
    if (has(/permission slip|consent form|please sign/i)) return 'PERMISSION';
    if (has(/homework|assignment|project due/i)) return 'HOMEWORK';
    if (has(/absenc|sick|ill|will not be.? attending|notification of absence/i)) return 'ABSENCE';
    if (has(/deadline|due by|rsvp/i)) return 'DEADLINE';
    if (has(/reminder|don'?t forget|please remember/i)) return 'REMINDER';
    if (has(/event|day|concert|function|sports day|fair|fun[ -]day/i) || ctx.eventDate) return 'EVENT';
    if (has(/notice|announcement|please note|information/i)) return 'GENERAL';
    return 'OTHER';
  }

  private detectTitle(raw: string): string {
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      const first = lines[0].replace(/^[^a-z0-9:]{0,3}/i, '');
      if (first.length > 2 && first.length <= 120) return first;
    }
    const m = raw.match(/^([^\n]{2,120})$/m);
    return m ? m[1].trim() : 'Untitled message';
  }

  private detectSummary(raw: string): string {
    const clean = raw.replace(/\n{2,}/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
  }

  private detectImportance(raw: string, type: AiExtraction['messageType']): number {
    if (this.hasAny(raw, /urgent|immediately|asap|important|mandatory/i)) return 9;
    if (type === 'EMERGENCY') return 10;
    if (type === 'PAYMENT' || type === 'DEADLINE') return 7;
    if (type === 'SCHOOL_CLOSURE') return 8;
    if (type === 'REMINDER') return 4;
    return 4;
  }

  private hasAny(raw: string, ...re: RegExp[]): boolean {
    return re.some((r) => r.test(raw));
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtMoney(n: number): string {
  return `R${n % 1 === 0 ? n : n.toFixed(2)}`;
}