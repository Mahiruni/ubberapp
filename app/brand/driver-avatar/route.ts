import { driverMapAvatarSvg } from '../../../lib/biloo-driver-map-avatar';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return new Response(driverMapAvatarSvg({ bodyType: params.get('bodyType'), color: params.get('color'), style: params.get('style') }), {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
  });
}
