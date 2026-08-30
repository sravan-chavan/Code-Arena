export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'client',
    milestone: 0,
  });
}
