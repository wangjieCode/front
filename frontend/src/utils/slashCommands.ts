import { SlashCommandMeta } from '../types/conversation';

export interface SlashQueryResult {
  active: boolean;
  query: string;
}

export function getSlashQuery(value: string): SlashQueryResult {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith('/')) {
    return { active: false, query: '' };
  }
  const body = trimmed.slice(1);
  if (body.includes(' ')) {
    return { active: false, query: '' };
  }
  return { active: true, query: body.toLowerCase() };
}

export function filterSlashCommands(commands: SlashCommandMeta[], query: string): SlashCommandMeta[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter(command => {
    const name = command.name.toLowerCase();
    const description = command.description.toLowerCase();
    return name.includes(normalized) || description.includes(normalized);
  });
}

export function buildSlashCommandText(command: SlashCommandMeta): string {
  if (command.name.startsWith('skill:')) {
    return `/skill ${command.name.slice('skill:'.length)} `;
  }
  return `/${command.name} `;
}

