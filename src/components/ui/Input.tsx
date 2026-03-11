import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  fullWidth = true,
  className = '',
  ...props
}) => {
  const width = fullWidth ? 'w-full' : '';
  const inputStyles = `px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
    error ? 'border-red-500' : 'border-gray-300'
  } ${width} ${className}`;

  return (
    <div className={`${width} mb-4`}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input className={inputStyles} {...props} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
};
