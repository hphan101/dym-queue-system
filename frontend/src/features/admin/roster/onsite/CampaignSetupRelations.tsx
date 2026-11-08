import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDisplayDate } from '../../utils/adminFormatters';
import {
  fetchCampaignRelations,
  type SetupRelationCampaign,
} from './setupLinks';
import type { RosterSchedule } from '../data/rosterService';

export function CampaignSetupRelations({
  campaign,
  onOpen,
}: {
  campaign: SetupRelationCampaign;
  onOpen: (campaign: RosterSchedule) => void;
}) {
  const [result, setResult] = useState<{
    key: string;
    rows: RosterSchedule[];
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const { id, schedule_type, campaign_group_id, setup_onsite_ids } = campaign;
  const key = `${campaign.id}:${campaign.schedule_type}:${campaign.campaign_group_id}:${(campaign.setup_onsite_ids ?? []).join(',')}:${retry}`;
  useEffect(() => {
    let active = true;
    void fetchCampaignRelations({
      id,
      schedule_type,
      campaign_group_id,
      setup_onsite_ids,
    })
      .then((rows) => {
        if (active) setResult({ key, rows });
      })
      .catch(() => {
        if (active)
          setError({ key, message: 'Không tải được lịch liên quan.' });
      });
    return () => {
      active = false;
    };
  }, [key, id, schedule_type, campaign_group_id, setup_onsite_ids]);
  const rows = result?.key === key ? result.rows : null;
  return (
    <section
      className="flex flex-col gap-2 border-b border-border px-5 py-4"
      aria-label="Liên kết set-up và đoàn khám"
    >
      <h3 className="text-sm font-semibold">
        {campaign.schedule_type === 'setup'
          ? 'Thuộc đoàn khám'
          : 'Lịch set-up của đợt khám'}
      </h3>
      {error?.key === key ? (
        <div className="flex items-center gap-2" role="alert">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Thử lại
          </Button>
        </div>
      ) : rows ? (
        rows.length ? (
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <Button
                type="button"
                key={row.id}
                variant="outline"
                data-type={row.schedule_type}
                className="dym-campaign-related-link h-auto whitespace-normal py-2 text-left"
                onClick={() => onOpen(row)}
              >
                {row.company_name} · {row.campaign_code} ·{' '}
                {formatDisplayDate(row.schedule_date)}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {campaign.schedule_type === 'setup'
              ? 'Chưa liên kết đoàn HC. Bấm Sửa để chọn đoàn khám.'
              : 'Chưa có lịch set-up liên kết.'}
          </p>
        )
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Đang tải lịch liên quan…
        </p>
      )}
    </section>
  );
}
