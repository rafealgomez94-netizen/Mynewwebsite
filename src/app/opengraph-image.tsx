import { ImageResponse } from 'next/og';
import { APP_NAME } from '@/lib/domain';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Workspace Digital — Run Your Business Smarter With AI';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px',
          background: 'linear-gradient(135deg, #0b1220 0%, #123a9e 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', color: '#8ab4ff' }}>{APP_NAME}</div>
        <div style={{ marginTop: 24, fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          Run Your Business Smarter With AI
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: '#c7d7ff', maxWidth: 900 }}>
          Customers, sales, appointments, inventory, marketing and AI analytics in one platform.
        </div>
      </div>
    ),
    size,
  );
}
