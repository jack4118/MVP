import prisma from '../config/database';

export interface CreateLeadData {
  name: string;
  contact?: string;
  notes?: string;
  status?: string;
}

export interface UpdateLeadData {
  name?: string;
  contact?: string;
  notes?: string;
  status?: string;
}

export const createLead = async (userId: string, data: CreateLeadData) => {
  const lead = await prisma.lead.create({
    data: {
      userId,
      name: data.name,
      contact: data.contact,
      notes: data.notes,
      status: data.status || 'new',
    },
  });

  return lead;
};

export const getLeads = async (userId: string) => {
  const leads = await prisma.lead.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return leads;
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

  return lead;
};

export const updateLead = async (userId: string, leadId: string, data: UpdateLeadData) => {
  const lead = await getLeadById(userId, leadId);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...data,
      lastActivityAt: new Date(),
    },
  });

  return updatedLead;
};

export const updateLeadStatus = async (userId: string, leadId: string, status: string) => {
  const lead = await getLeadById(userId, leadId);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      status,
      lastActivityAt: new Date(),
    },
  });

  return updatedLead;
};

