import React, { useState, useEffect } from 'react';
import { getDefaultAvatarForUser, getAvatarById } from '../../data/avatars.jsx';
import { ShieldCheck } from 'lucide-react';

const SIZE_MAP = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20 sm:w-24 sm:h-24'
};

export const UserAvatar = ({
  user,
  size = 'md',
  className = '',
  showBadge = false,
  badgePosition = 'bottom-right'
}) => {
  const [imageError, setImageError] = useState(false);
  const sizeClasses = SIZE_MAP[size] || size || 'w-10 h-10';

  useEffect(() => {
    setImageError(false);
  }, [user?.profile_photo]);

  const avatarPreset = (user?.avatar_id && getAvatarById(user.avatar_id)) || getDefaultAvatarForUser(user);
  const hasCustomPhoto = Boolean(user?.profile_photo && !imageError);

  return (
    <div className={`relative inline-flex items-center justify-center rounded-full shrink-0 select-none overflow-visible ${className}`}>
      <div className={`${sizeClasses} rounded-full overflow-hidden flex items-center justify-center bg-slate-100 shadow-2xs`}>
        {hasCustomPhoto ? (
          <img
            src={user.profile_photo}
            alt={user?.full_name || 'Citizen Avatar'}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          avatarPreset.render('100%')
        )}
      </div>

      {showBadge && user?.is_verified && (
        <span className={`absolute -bottom-0.5 -right-0.5 bg-emerald-600 rounded-full ring-2 ring-white flex items-center justify-center shadow-xs ${
          size === 'xl' ? 'w-6 h-6 ring-3' : size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
        }`}>
          <ShieldCheck className={size === 'xl' ? 'w-4 h-4 text-white' : size === 'lg' ? 'w-3 h-3 text-white' : 'w-2.5 h-2.5 text-white'} />
        </span>
      )}
    </div>
  );
};
