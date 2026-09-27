export default function Button({ 
  children, 
  variant = 'primary', 
  className = '', 
  onClick, 
  type = 'button',
  disabled = false,
  fullWidth = false
}) {
  const widthStyle = fullWidth ? "width: 100%;" : "";
  const disabledStyle = disabled ? "opacity: 0.5; cursor: not-allowed;" : "";
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant} ${className}`}
      style={{
        ...(fullWidth ? { width: '100%' } : {}),
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {})
      }}
    >
      {children}
    </button>
  );
}
