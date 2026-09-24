'use client';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Save, ShieldAlert, Globe, Bell } from 'lucide-react';

export default function AdminSettings() {
  const [platformName, setPlatformName] = useState('CodeArena');
  const [maxParticipants, setMaxParticipants] = useState('100');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(true);

  const handleSave = (e) => {
    e.preventDefault();
    // Simulate saving settings
    alert('Settings saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Platform Settings</h1>
        <p>Configure global system preferences and access controls.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-lg)', maxWidth: '800px' }}>
        
        {/* General Settings */}
        <Card>
          <div className="card-header" style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Globe size={18} style={{ color: 'var(--accent-cyan)' }} /> General Configuration
            </h2>
          </div>
          
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Platform Name</label>
              <input 
                type="text" 
                value={platformName} 
                onChange={(e) => setPlatformName(e.target.value)} 
                className="form-input" 
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>This name appears on the login screen and headers.</p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Max Global Participants</label>
              <input 
                type="number" 
                value={maxParticipants} 
                onChange={(e) => setMaxParticipants(e.target.value)} 
                className="form-input" 
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Maximum number of concurrent users allowed on the platform.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-sm)' }}>
              <Button type="submit" variant="primary">
                <Save size={16} style={{ marginRight: '6px' }} /> Save General Settings
              </Button>
            </div>
          </form>
        </Card>

        {/* Access Controls */}
        <Card>
          <div className="card-header" style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <ShieldAlert size={18} style={{ color: 'var(--accent-purple)' }} /> Access Controls
            </h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Allow New Registrations</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Enable or disable sign-ups for new participants.</p>
              </div>
              <button 
                onClick={() => setAllowRegistration(!allowRegistration)}
                style={{ 
                  width: '44px', height: '24px', borderRadius: '12px', 
                  background: allowRegistration ? 'var(--accent-emerald)' : 'var(--bg-input)', 
                  position: 'relative', transition: 'background 0.3s',
                  border: `1px solid ${allowRegistration ? 'var(--accent-emerald)' : 'var(--border-default)'}`
                }}
              >
                <div style={{ 
                  width: '18px', height: '18px', borderRadius: '50%', background: 'white', 
                  position: 'absolute', top: '2px', left: allowRegistration ? '22px' : '2px',
                  transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md)', background: 'rgba(244, 63, 94, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-rose)' }}>Maintenance Mode</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>When active, all non-admin users will be temporarily locked out.</p>
              </div>
              <button 
                onClick={() => setMaintenanceMode(!maintenanceMode)}
                style={{ 
                  width: '44px', height: '24px', borderRadius: '12px', 
                  background: maintenanceMode ? 'var(--accent-rose)' : 'var(--bg-input)', 
                  position: 'relative', transition: 'background 0.3s',
                  border: `1px solid ${maintenanceMode ? 'var(--accent-rose)' : 'var(--border-default)'}`
                }}
              >
                <div style={{ 
                  width: '18px', height: '18px', borderRadius: '50%', background: 'white', 
                  position: 'absolute', top: '2px', left: maintenanceMode ? '22px' : '2px',
                  transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
