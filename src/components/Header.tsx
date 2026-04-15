import React from 'react';

interface HeaderProps {
  logoUrl: string;
}

export const Header: React.FC<HeaderProps> = ({ logoUrl }) => (
  <div className="vsl-header">
    <img src="/logo.png" alt="Brazilian Life RP" className="vsl-logo" />
  </div>
);
