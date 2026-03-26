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
  baseStyleTone?: 'default' | 'professional' | 'friendly' | 'concise' | null;
  characterWarmth?: 'default' | 'low' | 'medium' | 'high' | null;
  characterEnthusiasm?: 'default' | 'low' | 'medium' | 'high' | null;
  characterHeadersLists?: 'default' | 'minimal' | 'structured' | null;
  characterEmoji?: 'default' | 'low' | 'medium' | 'high' | null;
  customInstructions?: string | null;
  nickname?: string | null;
  occupation?: string | null;
  aboutYou?: string | null;
  memoryEnabled?: boolean;
  recordHistoryEnabled?: boolean;
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
  baseStyleTone: true,
  characterWarmth: true,
  characterEnthusiasm: true,
  characterHeadersLists: true,
  characterEmoji: true,
  customInstructions: true,
  nickname: true,
  occupation: true,
  aboutYou: true,
  memoryEnabled: true,
  recordHistoryEnabled: true,
  defaultFollowUpDays: true,
  defaultCountryCode: true,
  inboxDefaultView: true,
  notifyNewInbound: true,
  notifyReminderDue: true,
  notifyDailyDigestHour: true,
  securityLastPasswordAt: true,
  securityLastLoginAt: true,
} as const;

const deriveBaseStyleToneFromLegacyTone = (tone?: string | null): 'default' | 'professional' | 'friendly' | 'concise' | null => {
  if (!tone) {
    return null;
  }
  if (tone === 'professional') {
    return 'professional';
  }
  if (tone === 'friendly' || tone === 'casual' || tone === 'empathetic') {
    return 'friendly';
  }
  if (tone === 'assertive' || tone === 'urgent') {
    return 'concise';
  }
  return 'default';
};

const deriveCharacterEmojiFromLegacyDensity = (emojiDensity?: string | null): 'default' | 'low' | 'medium' | 'high' | null => {
  if (!emojiDensity) {
    return null;
  }
  if (emojiDensity === 'low' || emojiDensity === 'medium' || emojiDensity === 'high') {
    return emojiDensity;
  }
  return 'default';
};

const withPersonalizationFallback = <T extends {
  defaultTone?: string | null;
  defaultEmojiDensity?: string | null;
  baseStyleTone?: string | null;
  characterWarmth?: string | null;
  characterEnthusiasm?: string | null;
  characterHeadersLists?: string | null;
  characterEmoji?: string | null;
  memoryEnabled?: boolean | null;
  recordHistoryEnabled?: boolean | null;
}>(user: T): T => {
  return {
    ...user,
    baseStyleTone: user.baseStyleTone || deriveBaseStyleToneFromLegacyTone(user.defaultTone),
    characterWarmth: user.characterWarmth || 'default',
    characterEnthusiasm: user.characterEnthusiasm || 'default',
    characterHeadersLists: user.characterHeadersLists || 'default',
    characterEmoji: user.characterEmoji || deriveCharacterEmojiFromLegacyDensity(user.defaultEmojiDensity) || 'default',
    memoryEnabled: user.memoryEnabled ?? true,
    recordHistoryEnabled: user.recordHistoryEnabled ?? true,
  };
};

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

  return withPersonalizationFallback(user);
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

  const userWithFallback = withPersonalizationFallback(user);

  return {
    token,
    user: {
      id: userWithFallback.id,
      email: userWithFallback.email,
      createdAt: userWithFallback.createdAt,
      displayName: userWithFallback.displayName,
      companyName: userWithFallback.companyName,
      industry: userWithFallback.industry,
      hasCompletedOnboarding: userWithFallback.hasCompletedOnboarding,
      defaultLanguage: userWithFallback.defaultLanguage,
      defaultTone: userWithFallback.defaultTone,
      defaultConversationMode: userWithFallback.defaultConversationMode,
      defaultEmojiDensity: userWithFallback.defaultEmojiDensity,
      defaultOutputFormat: userWithFallback.defaultOutputFormat,
      baseStyleTone: userWithFallback.baseStyleTone,
      characterWarmth: userWithFallback.characterWarmth,
      characterEnthusiasm: userWithFallback.characterEnthusiasm,
      characterHeadersLists: userWithFallback.characterHeadersLists,
      characterEmoji: userWithFallback.characterEmoji,
      customInstructions: userWithFallback.customInstructions,
      nickname: userWithFallback.nickname,
      occupation: userWithFallback.occupation,
      aboutYou: userWithFallback.aboutYou,
      memoryEnabled: userWithFallback.memoryEnabled,
      recordHistoryEnabled: userWithFallback.recordHistoryEnabled,
      defaultFollowUpDays: userWithFallback.defaultFollowUpDays,
      defaultCountryCode: userWithFallback.defaultCountryCode,
      inboxDefaultView: userWithFallback.inboxDefaultView,
      notifyNewInbound: userWithFallback.notifyNewInbound,
      notifyReminderDue: userWithFallback.notifyReminderDue,
      notifyDailyDigestHour: userWithFallback.notifyDailyDigestHour,
      securityLastPasswordAt: userWithFallback.securityLastPasswordAt,
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

  return withPersonalizationFallback(user);
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
      ...(data.baseStyleTone !== undefined ? { baseStyleTone: data.baseStyleTone || null } : {}),
      ...(data.characterWarmth !== undefined ? { characterWarmth: data.characterWarmth || null } : {}),
      ...(data.characterEnthusiasm !== undefined ? { characterEnthusiasm: data.characterEnthusiasm || null } : {}),
      ...(data.characterHeadersLists !== undefined ? { characterHeadersLists: data.characterHeadersLists || null } : {}),
      ...(data.characterEmoji !== undefined ? { characterEmoji: data.characterEmoji || null } : {}),
      ...(data.customInstructions !== undefined ? { customInstructions: data.customInstructions || null } : {}),
      ...(data.nickname !== undefined ? { nickname: data.nickname || null } : {}),
      ...(data.occupation !== undefined ? { occupation: data.occupation || null } : {}),
      ...(data.aboutYou !== undefined ? { aboutYou: data.aboutYou || null } : {}),
      ...(data.memoryEnabled !== undefined ? { memoryEnabled: data.memoryEnabled } : {}),
      ...(data.recordHistoryEnabled !== undefined ? { recordHistoryEnabled: data.recordHistoryEnabled } : {}),
      ...(data.defaultFollowUpDays !== undefined ? { defaultFollowUpDays: data.defaultFollowUpDays ?? null } : {}),
      ...(data.defaultCountryCode !== undefined ? { defaultCountryCode: data.defaultCountryCode || null } : {}),
      ...(data.inboxDefaultView !== undefined ? { inboxDefaultView: data.inboxDefaultView || null } : {}),
      ...(data.notifyNewInbound !== undefined ? { notifyNewInbound: data.notifyNewInbound } : {}),
      ...(data.notifyReminderDue !== undefined ? { notifyReminderDue: data.notifyReminderDue } : {}),
      ...(data.notifyDailyDigestHour !== undefined ? { notifyDailyDigestHour: data.notifyDailyDigestHour ?? null } : {}),
    },
    select: userSelect,
  });

  return withPersonalizationFallback(user);
};
