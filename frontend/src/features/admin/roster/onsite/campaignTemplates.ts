import { supabase } from '../../../../lib/supabaseClient';
import {
  CAMPAIGN_POSITION_TEMPLATES,
  type OnsiteScheduleInput,
} from '../data/rosterService';

export type CampaignType = OnsiteScheduleInput['schedule_type'];
export type CampaignTemplates = Record<CampaignType, string[]>;

export function validatePositionList(positions: string[]): string[] {
  const clean = positions.map((position) => position.trim());
  if (
    clean.length > 100 ||
    clean.some((position) => !position || position.length > 200)
  ) {
    throw new Error(
      'Nhập tên cho từng vị trí (tối đa 200 ký tự), không quá 100 vị trí.',
    );
  }
  if (new Set(clean).size !== clean.length)
    throw new Error('Tên vị trí không được trùng nhau.');
  return clean;
}

export async function fetchCampaignTemplates(): Promise<CampaignTemplates> {
  const { data, error } = await supabase
    .from('roster_position_templates')
    .select('schedule_type,positions');
  if (error) throw new Error(error.message || 'Không tải được vị trí mẫu.');
  const templates = { ...CAMPAIGN_POSITION_TEMPLATES };
  for (const row of data ?? []) {
    if (Object.hasOwn(templates, row.schedule_type))
      templates[row.schedule_type as CampaignType] = row.positions;
  }
  return templates;
}

export async function saveCampaignTemplate(
  type: CampaignType,
  positions: string[],
): Promise<string[]> {
  const clean = validatePositionList(positions);
  const { error } = await supabase.from('roster_position_templates').upsert({
    schedule_type: type,
    positions: clean,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message || 'Không lưu được vị trí mẫu.');
  return clean;
}
