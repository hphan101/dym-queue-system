import { lazy,Suspense,useEffect,useMemo,useState,type ComponentProps } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert,AlertDescription,AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table,TableBody,TableCaption,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';
import { handleInternalLinkClick } from '../../../../lib/navigation';
import { BRANCH_NAMES } from '../../../../config/branches';
import { formatDisplayDate } from '../../shared/adminFormatters';
import { RosterShell } from '../shared/RosterShell';
import { useRosterData } from '../data/useRosterData';
import {
  fetchRosterBundleForRange,
  formatVndCurrency,
  ROSTER_BRANCH_LABELS,
  SCHEDULE_TYPE_LABELS,
  shiftIsoDate,
} from '../data/rosterService';
import {
  buildDashboardSummary,
  dashboardHref,
  type DashboardBranch,
  type DashboardBundle,
} from './dashboardSummary';
import './dashboard.css';
import '../shared/campaignColors.css';

const ReceptionTrendChart=lazy(() => import('./ReceptionTrendChart').then((module) => ({ default: module.ReceptionTrendChart })));
const WeeklyCampaignChart=lazy(() => import('./WeeklyCampaignChart').then((module) => ({ default: module.WeeklyCampaignChart })));

function PageLink({
  href,
  children,
  ...props
}: ComponentProps<'a'>&{ href: string; }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        props.onClick?.(event);
        handleInternalLinkClick(event,href);
      }}
    >
      {children}
    </a>
  );
}

export function RosterDashboardPage({
  authorizedIsAdmin=true,
  isActiveTab=true,
}: {
  authorizedIsAdmin?: boolean;
  isActiveTab?: boolean;
}) {
  const {
    selectedDate,
    setSelectedDate,
    selectedBranch,
    setSelectedBranch,
    roomsList,
    schedules,
    assignments,
    dailyRoomOverrides,
    personnelMap,
    rosterToday,
    isLoading,
    errorBanner,
    reloadAll,
  }=useRosterData();
  const [branch,setBranch]=useState<DashboardBranch>('all');
  const [showCosts,setShowCosts]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [result,setResult]=useState<{
    key: string;
    bundle: DashboardBundle;
  }|null>(null);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [loadingRange,setLoadingRange]=useState(true);
  const month=selectedDate.slice(0,7);
  const monthEnd=new Date(
    Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0),
  )
    .toISOString()
    .slice(0,10);
  const upcomingEnd=shiftIsoDate(selectedDate,6);
  const rangeEnd=upcomingEnd>monthEnd? upcomingEnd:monthEnd;
  const rangeKey=`${month}:${rangeEnd}`;

  useEffect(() => {
    if(!isActiveTab||isLoading) return;
    let current=true;
    setLoadingRange(true);
    setLoadError(null);
    void fetchRosterBundleForRange(`${month}-01`,rangeEnd)
      .then((bundle) => {
        if(current) setResult({ key: rangeKey,bundle });
      })
      .catch((cause) => {
        if(current)
          setLoadError(
            cause instanceof Error
              ? cause.message
              :'Không tải được tổng quan.',
          );
      })
      .finally(() => {
        if(current) setLoadingRange(false);
      });
    return () => {
      current=false;
    };
  },[
    month,
    rangeEnd,
    rangeKey,
    isActiveTab,
    isLoading,
    schedules,
    assignments,
    dailyRoomOverrides,
    refresh,
  ]);

  const summary=useMemo(
    () =>
      result?.key===rangeKey
        ? buildDashboardSummary(
          result.bundle,
          roomsList,
          selectedDate,
          branch,
          rosterToday,
        )
        :null,
    [result,rangeKey,roomsList,selectedDate,branch,rosterToday],
  );
  const busy=isLoading||loadingRange||!summary;
  const scopeBranch=branch==='all'? selectedBranch:branch;
  const settlementHref=dashboardHref(
    'roster-settlement',
    selectedDate,
    scopeBranch,
  );
  const campaignHref=(schedule: DashboardBundle['schedules'][number]) =>
    dashboardHref(
      'roster-onsite',
      schedule.schedule_date,
      schedule.branch_code,
      schedule.id,
      schedule.schedule_type,
    );
  const taskLinks=summary
    ? [
      ...summary.clinics
        .filter((clinic) => clinic.missing>0)
        .map((clinic) => ({
          title: `${ROSTER_BRANCH_LABELS[clinic.branch as 'q1'|'q7']}: thiếu ${clinic.missing} phòng`,
          description: `Đã xếp ${clinic.filled}/${clinic.total} phòng · ${formatDisplayDate(selectedDate)}`,
          href: dashboardHref('roster-insite',selectedDate,clinic.branch),
        })),
      ...summary.dailyCampaigns
        .filter((item) => item.missing.length>0)
        .map((item) => ({
          title: `${item.schedule.company_name}: thiếu ${item.missing.length} vị trí`,
          description: item.missing.join(', '),
          href: campaignHref(item.schedule),
        })),
      ...summary.conflicts.map((item) => ({
        title: `${personnelMap.get(item.personnelId)?.full_name??'Nhân sự'}: cần kiểm tra trùng ca`,
        description: item.schedules
          .map(
            (schedule) =>
              schedule.company_name||BRANCH_NAMES[schedule.branch_code],
          )
          .join(' · '),
        href:
          item.schedules[0].schedule_type==='insite'
            ? dashboardHref(
              'roster-insite',
              selectedDate,
              item.schedules[0].branch_code,
            )
            :campaignHref(item.schedules[0]),
      })),
      ...summary.unlinked.map((item) => ({
        title: `${item.schedule.company_name}: set-up chưa liên kết`,
        description: `Chọn đoàn Onsite HC liên quan · ${formatDisplayDate(item.schedule.schedule_date)}`,
        href: campaignHref(item.schedule),
      })),
      ...summary.unconfigured.map((item) => ({
        title: `${item.schedule.company_name}: chưa khai báo vị trí`,
        description: `${SCHEDULE_TYPE_LABELS[item.schedule.schedule_type]} · ${formatDisplayDate(item.schedule.schedule_date)}`,
        href: campaignHref(item.schedule),
      })),
    ]
    :[];
  const metrics=summary
    ? [
      {
        title: 'Đoàn trong ngày',
        value: summary.dailyCampaigns.length,
        note: `${summary.upcoming.length} lịch đoàn trong 7 ngày`,
      },
      {
        title: 'Phòng đã có nhân sự',
        value: `${summary.staffed}/${summary.rooms}`,
        note: `${summary.rooms-summary.staffed} phòng cần bổ sung`,
      },
      {
        title: 'Nhân sự đã phân công',
        value: summary.personnel,
        note: 'Số người riêng biệt trong ngày',
      },
      {
        title: 'Vị trí còn thiếu',
        value: summary.missing,
        note: 'Theo danh sách phòng / vị trí đã khai báo',
      },
    ]
    :[];

  return (
    <RosterShell
      activePage="roster-dashboard"
      title="Tổng quan vận hành"
      contentClassName="dym-overview-content"
      authorizedIsAdmin={authorizedIsAdmin}
      headerActions={
        <div className="roster-dashboard-header-actions">
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            ariaLabel="Ngày xem tổng quan"
          />
          <Select
            value={branch}
            onValueChange={(value) => {
              setBranch(value as DashboardBranch);
              if(value!=='all') setSelectedBranch(value as 'q1'|'q7');
            }}
          >
            <SelectTrigger className="w-44" aria-label="Lọc chi nhánh">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                <SelectItem value="q1">D1 – Quận 1</SelectItem>
                <SelectItem value="q7">D7 – Quận 7</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading||loadingRange}
            aria-busy={isLoading||loadingRange}
            className="roster-dashboard-refresh"
            onClick={() => {
              setRefresh((value) => value+1);
              void reloadAll(true);
            }}
          >
            <RefreshCw data-icon="inline-start" />
            Làm mới
          </Button>
        </div>
      }
    >
      <div className="dym-roster-dashboard dym-onsite-page">

        {loadError||errorBanner? (
          <Alert variant="destructive">
            <AlertTitle>Chưa tải được dữ liệu tổng quan</AlertTitle>
            <AlertDescription>{loadError||errorBanner}</AlertDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setRefresh((value) => value+1);
                void reloadAll(true);
              }}
            >
              Thử lại
            </Button>
          </Alert>
        ):busy? (
          <div
            className="roster-dashboard-metrics"
            role="status"
            aria-label="Đang tải tổng quan"
          >
            {[0,1,2,3].map((index) => (
              <Skeleton key={index} className="h-36" />
            ))}
          </div>
        ):(
          summary&&(
            <>
              <div className="roster-dashboard-metrics">
                {metrics.map(({ title,value,note }) => (
                  <Card key={title} className="roster-dashboard-metric">
                    <CardHeader className="p-4 pb-2">
                      <CardDescription>{title}</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <strong className="roster-dashboard-number">
                        {value}
                      </strong>
                      <p className="roster-dashboard-caption">{note}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="roster-dashboard-priority-grid">
                <Card className="roster-dashboard-panel">
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="roster-dashboard-section-title">Clinic trong ngày</CardTitle>
                    <CardDescription>
                      Mỗi phòng có ít nhất một nhân sự được tính là đã xếp.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="roster-dashboard-clinic-grid px-5 pb-4">
                    {summary.clinics.map((clinic) => (
                      <div
                        key={clinic.branch}
                        className="roster-dashboard-clinic"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <strong>
                            {ROSTER_BRANCH_LABELS[clinic.branch as 'q1'|'q7']}
                          </strong>
                          <Badge variant="outline" data-status={clinic.total===0? 'empty':clinic.missing? 'missing':'complete'}>
                            {clinic.total===0
                              ? 'Chưa có phòng'
                              :clinic.missing
                                ? `Thiếu ${clinic.missing} phòng`
                                :'Đã xếp đủ'}
                          </Badge>
                        </div>
                        <Progress
                          className="roster-dashboard-progress"
                          aria-label={`Phòng đã xếp tại ${clinic.branch}`}
                          aria-valuetext={`${clinic.filled}/${clinic.total} phòng đã phân công`}
                          value={clinic.total? (clinic.filled/clinic.total)*100:0}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="roster-dashboard-caption">
                            Đã xếp {clinic.filled}/{clinic.total} phòng
                          </p>
                          <Button variant="ghost" size="sm" asChild>
                            <PageLink
                              href={dashboardHref(
                                'roster-insite',
                                selectedDate,
                                clinic.branch,
                              )}
                            >
                              Xem lịch
                              <ArrowRight data-icon="inline-end" />
                            </PageLink>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="roster-dashboard-panel">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="roster-dashboard-section-title">Cần xử lý</CardTitle>
                      <Badge variant="secondary">{taskLinks.length} mục</Badge>
                    </div>
                    <CardDescription>
                      Thiếu nhân sự trong ngày và lịch đoàn cần hoàn thiện trong
                      7 ngày.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="roster-dashboard-tasks">
                    {taskLinks.length? (
                      taskLinks.map((item,index) => (
                        <Button key={`${item.href}:${index}`} variant="ghost" asChild className="h-auto w-full justify-start whitespace-normal">
                          <PageLink href={item.href} className="roster-dashboard-task">
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.description}</small>
                            </span>
                            <ArrowRight aria-hidden="true" />
                          </PageLink>
                        </Button>
                      ))
                    ):(
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Đã hoàn tất phân công</EmptyTitle>
                          <EmptyDescription>
                            Chưa phát hiện mục cần xử lý trong phạm vi đang xem.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              </div>
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <ReceptionTrendChart date={selectedDate} today={rosterToday} branch={branch} isActiveTab={isActiveTab} refresh={refresh} />
              </Suspense>
              <Card className="roster-dashboard-panel">
                <CardHeader>
                  <CardTitle className="roster-dashboard-section-title">Đoàn khám sắp tới</CardTitle>
                  <CardDescription>
                    7 ngày từ {formatDisplayDate(selectedDate)} · Mỗi ngày thực
                    hiện của đoàn được hiển thị riêng.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.upcoming.length? (
                    <Table className="roster-dashboard-table roster-dashboard-upcoming">
                      <TableCaption className="sr-only">
                        Danh sách đoàn trong 7 ngày
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ngày thực hiện</TableHead>
                          <TableHead>Công ty / Đơn vị</TableHead>
                          <TableHead>Loại đoàn</TableHead>
                          <TableHead>Cơ sở ký HĐ</TableHead>
                          <TableHead>Phân công</TableHead>
                          <TableHead>
                            <span className="sr-only">Thao tác</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.upcoming.map((item) => (
                          <TableRow key={item.schedule.id}>
                            <TableCell className="tabular-nums">
                              {formatDisplayDate(item.schedule.schedule_date)}
                              {item.schedule.schedule_date===
                                selectedDate&&<small>Ngày đang xem</small>}
                            </TableCell>
                            <TableCell>
                              <strong>
                                {item.schedule.company_name||
                                  'Chưa có tên công ty'}
                              </strong>
                              <small>{item.schedule.campaign_code}</small>
                            </TableCell>
                            <TableCell>
                              <span
                                className="dym-campaign-type-label"
                                data-type={item.schedule.schedule_type}
                              >
                                {
                                  SCHEDULE_TYPE_LABELS[
                                  item.schedule.schedule_type
                                  ]
                                }
                              </span>
                            </TableCell>
                            <TableCell>{BRANCH_NAMES[item.schedule.branch_code]}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.required>0&&
                                    item.missing.length===0
                                    ? 'secondary'
                                    :'outline'
                                }
                              >
                                {item.required
                                  ? `${item.filled}/${item.required} vị trí`
                                  :'Chưa khai báo'}
                              </Badge>
                              <small>
                                {item.required
                                  ? item.missing.length
                                    ? `Còn thiếu ${item.missing.length}`
                                    :'Đã có nhân sự'
                                  :'Cần thêm danh sách vị trí'}
                              </small>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" asChild>
                                <PageLink href={campaignHref(item.schedule)}>
                                  Chi tiết
                                  <ArrowRight data-icon="inline-end" />
                                </PageLink>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ):(
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>Chưa có đoàn trong 7 ngày này</EmptyTitle>
                        <EmptyDescription>
                          Đổi ngày hoặc chi nhánh để xem lịch khác.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button variant="outline" asChild>
                        <PageLink
                          href={dashboardHref(
                            'roster-onsite',
                            selectedDate,
                            scopeBranch,
                          )}
                        >
                          Mở lịch đoàn
                        </PageLink>
                      </Button>
                    </Empty>
                  )}
                </CardContent>
              </Card>
              <div className="roster-dashboard-secondary-grid">
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <WeeklyCampaignChart weeks={summary.weeks} count={summary.monthlyCampaignCount} month={month} />
                </Suspense>
                <Card className="roster-dashboard-panel">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <CardTitle className="roster-dashboard-section-title">
                          Chi phí tháng {month.slice(5)}/{month.slice(0,4)}
                        </CardTitle>
                        <CardDescription>
                          Theo chi nhánh đang lọc. Chi phí thực tế không gồm dự
                          phòng.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-pressed={showCosts}
                        onClick={() => setShowCosts((value) => !value)}
                      >
                        {showCosts? (
                          <EyeOff data-icon="inline-start" />
                        ):(
                          <Eye data-icon="inline-start" />
                        )}
                        {showCosts? 'Ẩn chi phí':'Hiện chi phí'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="roster-dashboard-finances">
                      {[
                        {
                          label: 'Chi phí dự kiến',
                          value: summary.forecast,
                          note: 'Chi phí đã xếp + dự phòng từ hôm nay',
                        },
                        {
                          label: 'Dự phòng còn thiếu',
                          value: summary.reserve,
                          note: 'Chỉ tính lịch từ hôm nay trở đi',
                        },
                        {
                          label: 'Chi phí thực tế',
                          value: summary.actual,
                          note: 'Chi phí đã xếp đến hết hôm qua',
                        },
                      ].map((item) => (
                        <div key={item.label}>
                          <p>{item.label}</p>
                          <strong className="roster-dashboard-money">
                            {showCosts? formatVndCurrency(item.value):'••••••'}
                          </strong>
                          <small>{item.note}</small>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex justify-end">
                      <Button variant="outline" size="sm" asChild>
                        <PageLink href={settlementHref}>
                          Mở trang Quyết toán
                          <ArrowRight data-icon="inline-end" />
                        </PageLink>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )
        )}
      </div>
    </RosterShell>
  );
}
