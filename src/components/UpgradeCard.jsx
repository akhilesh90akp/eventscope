/**
 * UpgradeCard — shown in place of a feature the company's plan doesn't
 * include (e.g. Job Log on Basic, Contracts on Standard). Owners get a
 * "See plans" button (→ Plan & billing); staff are told to ask the owner.
 * Also exports PlanTag, the small "Standard" / "Premium" pill used next to
 * locked menu items and buttons.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { FEATURES, planFor } from '../utils/billing';

// ============================================================
// PlanTag
// ============================================================
export function PlanTag({ feature, dark = false }) {
  const name = planFor(feature);
  return (
    <span className={`text-[9.5px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${dark ? 'bg-amber-300/20 text-amber-200' : name === 'Premium' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-700'}`}>
      {name}
    </span>
  );
}

// ============================================================
// UpgradeCard — MAIN COMPONENT
// ============================================================
export default function UpgradeCard({ feature, text }) {
  const { isOwner } = useApp();
  const navigate = useNavigate();
  const plan = planFor(feature);
  const premium = plan === 'Premium';
  return (
    <div className="max-w-xl mx-auto my-6 rounded-[20px] px-6 py-8 text-center relative overflow-hidden" data-testid="upgrade-card"
      style={premium
        ? { background: 'radial-gradient(120% 80% at 100% 0%, #5b2a86 0%, #2a1240 55%, #1c0c2c 100%)', color: '#fff' }
        : { background: 'linear-gradient(135deg,#faf8ff,#f3eefe)', border: '1px solid #e4dcfb', color: '#1f1530' }}>
      <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto mb-3" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill={premium ? '#f5c451' : '#7c3aed'} opacity=".18" />
        <path d="M12 5l1.7 4.6L18 11.3l-4.3 1.7L12 17.6l-1.7-4.6L6 11.3l4.3-1.7z" fill={premium ? '#f5c451' : '#7c3aed'} />
      </svg>
      <p className="text-lg font-bold">{FEATURES[feature]} {FEATURES[feature]?.endsWith('s') ? 'are' : 'is'} on the {plan} plan</p>
      <p className={`text-sm mt-1.5 max-w-sm mx-auto ${premium ? 'text-white/75' : 'text-[#6b6478]'}`}>
        {text || 'Upgrade to use it.'} {isOwner ? '' : 'Ask your company owner to upgrade.'}
      </p>
      {isOwner && (
        <button onClick={() => navigate('/billing')}
          className="mt-5 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
          style={premium ? { background: 'linear-gradient(135deg,#f8d77a,#e0a92e)', color: '#2a1240' } : { background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff' }}>
          See plans
        </button>
      )}
    </div>
  );
}
