export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'admin',
    milestone: 0,
  });
}
