/** W04·e every export of this trip, web and mobile, provisional or final, downloadable again (FR-EXPT-07). */
import { useExportPreview } from '../../api/hooks';
import type { FinanceTrip } from '../../api/types';
import { ExportActions, ExportStatus } from '../../components/exports';
import { Banner, Btn, Card, EmptyState, Tbl, Who } from '../../components/ui';
import { fmtBytes, fmtDayTime } from '../../lib/format';
import { fmtFormats } from '../../lib/labels';
import { tripPath } from '../../lib/links';

export function ExportsTab({ t }: { t: FinanceTrip }) {
  const prev = useExportPreview(t.trip.id, { scope: 'trip', formats: 'pdf' });
  const newestProv = t.exports.find(x => x.status === 'ready')?.provisional;
  return (
    <>
      <Card title="Every export of this trip" icon="history" flush right={<Btn kind="pri" size="sm" icon="download" to={tripPath(t.trip, 'export')}>New export</Btn>}>
        {t.exports.length ? (
          <Tbl label="Exports of this trip" heads={[['When'], ['By'], ['Scope'], ['Formats'], ['Status'], ['Size', 'r'], ['', 'r']]}>
            {t.exports.map(x => (
              <tr key={x.id}>
                <td>{fmtDayTime(x.createdAt)}</td>
                <td><Who name={x.requestedByName ?? 'Someone'} sub={x.via === 'mobile' ? 'Mobile app' : 'Web'} /></td>
                <td>{x.scopeLabel}{x.limitLabel && <span className="t2">{x.limitLabel}</span>}</td>
                <td>{fmtFormats(x.formats)}</td>
                <td><ExportStatus x={x} withFinal={false} /></td>
                <td className="r">{x.status === 'ready' ? fmtBytes(x.sizeBytes) : '–'}</td>
                <td className="r"><ExportActions x={x} /></td>
              </tr>
            ))}
          </Tbl>
        ) : <EmptyState icon="fileZip" title="Not exported yet" actions={<Btn kind="pri" size="sm" icon="download" to={tripPath(t.trip, 'export')}>New export</Btn>}>Exports from the web and members’ own exports from the phone are listed here, and every one stays downloadable.</EmptyState>}
      </Card>
      {prev.data && (prev.data.provisional ? (
        <Banner tone="neutral" icon="info" title={newestProv ? 'Why exports of this trip are Provisional right now' : 'An export now would be Provisional'}>
          {prev.data.reasons.join(' ')} Export again after verification for a final copy; earlier exports stay downloadable.
        </Banner>
      ) : (
        <Banner tone="ok" icon="badgeCheck" title="An export now would be final">The trip is closed and every claim is verified.</Banner>
      ))}
    </>
  );
}
