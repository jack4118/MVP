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
