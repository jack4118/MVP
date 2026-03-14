import prisma from '../config/database';
import { normalizeLeadStatus } from './followUpService';

export interface CreateLeadData {
  name: string;
  contact?: string;
  notes?: string;
  status?: string;
  closedReason?: string;
  nextFollowUpAt?: string;
}

export interface UpdateLeadData {
  name?: string;
  contact?: string;
  notes?: string;
  status?: string;
  closedReason?: string;
  nextFollowUpAt?: string;
}

export interface LeadMemoryData {
  memorySummary?: string | null;
  memoryGoal?: string | null;
  aiTonePreference?: string | null;
  aiConversationMode?: string | null;
  aiEmojiDensity?: string | null;
  aiOutputFormat?: string | null;
}

export interface ImportLeadData {
  name: string;
  contact?: string;
  notes?: string;
  status?: string;
}

const normalizeLead = <T extends { status: string }>(lead: T): T => ({
  ...lead,
  status: normalizeLeadStatus(lead.status),
});

export const createLead = async (userId: string, data: CreateLeadData) => {
  const lead = await prisma.lead.create({
    data: {
      userId,
      name: data.name,
      contact: data.contact,
      notes: data.notes,
      status: normalizeLeadStatus(data.status),
      closedReason: data.closedReason,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    },
  });

  return normalizeLead(lead);
};

export const getLeads = async (userId: string) => {
  const leads = await prisma.lead.findMany({
    where: { userId },
    orderBy: [
      { nextFollowUpAt: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  return leads.map(normalizeLead);
};

export const getLeadById = async (userId: string, leadId: string) => {
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      userId,
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  return normalizeLead(lead);
};

export const updateLead = async (userId: string, leadId: string, data: UpdateLeadData) => {
  await getLeadById(userId, leadId);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.contact !== undefined ? { contact: data.contact } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.status !== undefined ? { status: normalizeLeadStatus(data.status) } : {}),
      ...(data.closedReason !== undefined ? { closedReason: data.closedReason } : {}),
      ...(data.nextFollowUpAt !== undefined ? { nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null } : {}),
      lastActivityAt: new Date(),
    },
  });

  return normalizeLead(updatedLead);
};

export const updateLeadStatus = async (userId: string, leadId: string, status: string) => {
  await getLeadById(userId, leadId);

  const normalizedStatus = normalizeLeadStatus(status);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: normalizedStatus,
      ...(normalizedStatus === 'won' || normalizedStatus === 'lost' ? { nextFollowUpAt: null } : {}),
      lastActivityAt: new Date(),
    },
  });

  return normalizeLead(updatedLead);
};

export const updateLeadMemory = async (userId: string, leadId: string, data: LeadMemoryData) => {
  await getLeadById(userId, leadId);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(data.memorySummary !== undefined ? { memorySummary: data.memorySummary } : {}),
      ...(data.memoryGoal !== undefined ? { memoryGoal: data.memoryGoal } : {}),
      ...(data.aiTonePreference !== undefined ? { aiTonePreference: data.aiTonePreference } : {}),
      ...(data.aiConversationMode !== undefined ? { aiConversationMode: data.aiConversationMode } : {}),
      ...(data.aiEmojiDensity !== undefined ? { aiEmojiDensity: data.aiEmojiDensity } : {}),
      ...(data.aiOutputFormat !== undefined ? { aiOutputFormat: data.aiOutputFormat } : {}),
      memoryUpdatedAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  return normalizeLead(updatedLead);
};

const sanitizeContact = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

export const parseImportedLeadRows = (csvText?: string, rows?: ImportLeadData[]) => {
  if (rows?.length) {
    return rows
      .map((row) => ({
        name: row.name.trim(),
        contact: sanitizeContact(row.contact),
        notes: row.notes?.trim() || undefined,
        status: normalizeLeadStatus(row.status),
      }))
      .filter((row) => row.name);
  }

  const text = (csvText || '').trim();
  if (!text) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const columns = parseCsvLine(line);
      if (columns.length === 1) {
        return {
          name: columns[0],
          contact: undefined,
          notes: undefined,
          status: 'new',
        };
      }

      if (index === 0) {
        const lower = columns.map((col) => col.toLowerCase());
        const headerLike = lower.includes('name') || lower.includes('contact') || lower.includes('phone');
        if (headerLike) {
          return null;
        }
      }

      return {
        name: columns[0] || columns[1] || '',
        contact: sanitizeContact(columns[1] || columns[0]),
        notes: columns.slice(2).join(', ') || undefined,
        status: 'new',
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && !!row.name.trim())
    .map((row) => ({
      ...row,
      name: row.name.trim(),
    }));
};

export const importLeads = async (userId: string, items: ImportLeadData[]) => {
  const prepared = parseImportedLeadRows(undefined, items);
  if (!prepared.length) {
    return { created: [], skipped: 0 };
  }

  const created = await prisma.$transaction(
    prepared.map((item) =>
      prisma.lead.create({
        data: {
          userId,
          name: item.name,
          contact: item.contact,
          notes: item.notes,
          status: normalizeLeadStatus(item.status),
        },
      })
    )
  );

  return {
    created: created.map(normalizeLead),
    skipped: 0,
  };
};
