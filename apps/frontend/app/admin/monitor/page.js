'use client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { workers, metrics } from '@/lib/mockData';
import { Server, Cpu, HardDrive, Activity, RefreshCw } from 'lucide-react';

export default function AdminMonitor() {
  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>System Monitor</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Real-time health and status of execution workers.</p>
        </div>
        <Button variant="secondary" className="btn-lg">
          <RefreshCw size={16} style={{ marginRight: '8px' }} /> Refresh Data
        </Button>
      </div>

      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Workers</span>
            <Server className="stat-card-icon" style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div className="stat-card-value">{workers.length}</div>
        </div>
        
        <div className="stat-card emerald">
          <div className="stat-card-header">
            <span className="stat-card-label">Online (Idle)</span>
            <Activity className="stat-card-icon" style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <div className="stat-card-value">{metrics.onlineWorkers}</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-card-header">
            <span className="stat-card-label">Busy Executing</span>
            <Cpu className="stat-card-icon" style={{ color: 'var(--accent-amber)' }} />
          </div>
          <div className="stat-card-value">{metrics.busyWorkers}</div>
        </div>
        
        <div className="stat-card rose">
          <div className="stat-card-header">
            <span className="stat-card-label">Offline / Failed</span>
            <HardDrive className="stat-card-icon" style={{ color: 'var(--accent-rose)' }} />
          </div>
          <div className="stat-card-value">{metrics.offlineWorkers}</div>
        </div>
      </div>

      <Card>
        <div className="card-header">
          <h2 className="card-title">Worker Nodes</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {workers.map(worker => (
            <div key={worker.id} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', position: 'relative', overflow: 'hidden' }}>
              {worker.status === 'offline' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1, backdropFilter: 'blur(2px)' }}></div>}
              
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={18} style={{ color: worker.status === 'offline' ? 'var(--text-muted)' : 'var(--accent-cyan)' }} />
                    <h3 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{worker.name}</h3>
                  </div>
                  <Badge status={worker.status} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>IP Address:</span>
                    <span style={{ fontFamily: 'var(--font-code)' }}>{worker.ip}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Uptime:</span>
                    <span>{worker.uptime}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Executions:</span>
                    <span>{worker.executionsCompleted}</span>
                  </div>
                </div>

                <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>CPU Usage</span>
                      <span style={{ color: worker.cpu > 80 ? 'var(--accent-rose)' : 'var(--accent-cyan)' }}>{worker.cpu}%</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--bg-input)', borderRadius: 'var(--radius-full)', height: '4px' }}>
                      <div style={{ background: worker.cpu > 80 ? 'var(--accent-rose)' : 'var(--accent-cyan)', height: '100%', borderRadius: 'var(--radius-full)', width: `${worker.cpu}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Memory Usage</span>
                      <span style={{ color: worker.memory > 80 ? 'var(--accent-rose)' : 'var(--accent-purple)' }}>{worker.memory}%</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--bg-input)', borderRadius: 'var(--radius-full)', height: '4px' }}>
                      <div style={{ background: worker.memory > 80 ? 'var(--accent-rose)' : 'var(--accent-purple)', height: '100%', borderRadius: 'var(--radius-full)', width: `${worker.memory}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
