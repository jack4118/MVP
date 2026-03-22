import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

export interface RegisterData {
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface UpdateProfileData {
  displayName?: string | null;
  companyName?: string | null;
  industry?: string | null;
  hasCompletedOnboarding?: boolean | null;
  defaultLanguage?: 'en' | 'zh-CN' | 'ms' | null;
  defaultTone?: string | null;
  defaultConversationMode?: string | null;
  defaultEmojiDensity?: string | null;
  defaultOutputFormat?: string | null;
  defaultFollowUpDays?: number | null;
  defaultCountryCode?: string | null;
  inboxDefaultView?: 'inbox' | 'contacts' | 'setup' | null;
  notifyNewInbound?: boolean;
  notifyReminderDue?: boolean;
  notifyDailyDigestHour?: number | null;
}

const userSelect = {
  id: true,
  email: true,
  createdAt: true,
  displayName: true,
  companyName: true,
  industry: true,
  hasCompletedOnboarding: true,
  defaultLanguage: true,
  defaultTone: true,
  defaultConversationMode: true,
  defaultEmojiDensity: true,
  defaultOutputFormat: true,
  defaultFollowUpDays: true,
  defaultCountryCode: true,
  inboxDefaultView: true,
  notifyNewInbound: true,
  notifyReminderDue: true,
  notifyDailyDigestHour: true,
  securityLastPasswordAt: true,
  securityLastLoginAt: true,
} as const;

export const register = async (data: RegisterData) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('Email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      hasCompletedOnboarding: false,
      securityLastPasswordAt: new Date(),
    },
    select: userSelect,
  });

  return user;
};

export const login = async (data: LoginData) => {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);

  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { securityLastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      displayName: user.displayName,
      companyName: user.companyName,
      industry: user.industry,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      defaultLanguage: user.defaultLanguage,
      defaultTone: user.defaultTone,
      defaultConversationMode: user.defaultConversationMode,
      defaultEmojiDensity: user.defaultEmojiDensity,
      defaultOutputFormat: user.defaultOutputFormat,
      defaultFollowUpDays: user.defaultFollowUpDays,
      defaultCountryCode: user.defaultCountryCode,
      inboxDefaultView: user.inboxDefaultView,
      notifyNewInbound: user.notifyNewInbound,
      notifyReminderDue: user.notifyReminderDue,
      notifyDailyDigestHour: user.notifyDailyDigestHour,
      securityLastPasswordAt: user.securityLastPasswordAt,
      securityLastLoginAt: new Date(),
    },
  };
};

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

export const updateCurrentUser = async (userId: string, data: UpdateProfileData) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.displayName !== undefined ? { displayName: data.displayName || null } : {}),
      ...(data.companyName !== undefined ? { companyName: data.companyName || null } : {}),
      ...(data.industry !== undefined ? { industry: data.industry || null } : {}),
      ...(data.hasCompletedOnboarding !== undefined ? { hasCompletedOnboarding: Boolean(data.hasCompletedOnboarding) } : {}),
      ...(data.defaultLanguage !== undefined ? { defaultLanguage: data.defaultLanguage || null } : {}),
      ...(data.defaultTone !== undefined ? { defaultTone: data.defaultTone || null } : {}),
      ...(data.defaultConversationMode !== undefined ? { defaultConversationMode: data.defaultConversationMode || null } : {}),
      ...(data.defaultEmojiDensity !== undefined ? { defaultEmojiDensity: data.defaultEmojiDensity || null } : {}),
      ...(data.defaultOutputFormat !== undefined ? { defaultOutputFormat: data.defaultOutputFormat || null } : {}),
      ...(data.defaultFollowUpDays !== undefined ? { defaultFollowUpDays: data.defaultFollowUpDays ?? null } : {}),
      ...(data.defaultCountryCode !== undefined ? { defaultCountryCode: data.defaultCountryCode || null } : {}),
      ...(data.inboxDefaultView !== undefined ? { inboxDefaultView: data.inboxDefaultView || null } : {}),
      ...(data.notifyNewInbound !== undefined ? { notifyNewInbound: data.notifyNewInbound } : {}),
      ...(data.notifyReminderDue !== undefined ? { notifyReminderDue: data.notifyReminderDue } : {}),
      ...(data.notifyDailyDigestHour !== undefined ? { notifyDailyDigestHour: data.notifyDailyDigestHour ?? null } : {}),
    },
    select: userSelect,
  });

  return user;
};
