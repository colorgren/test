import React from 'react';

interface ImageUploadProps {
  onFileChange: (file: File) => void;
  disabled?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onFileChange, disabled }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileChange(event.target.files[0]);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset input
      }
    }
  };

  return (
    <div className="my-2">
      <label
        htmlFor="image-upload"
        className={`px-5 py-2.5 rounded-lg shadow-md cursor-pointer transition-all duration-150 ease-in-out text-sm font-medium
        ${
          disabled
            ? 'bg-slate-500 text-slate-300 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700 text-white focus-within:ring-2 focus-within:ring-purple-400 focus-within:ring-opacity-75'
        }`}
      >
        {disabled ? 'Processing...' : 'Upload Center Image'}
      </label>
      <input
        id="image-upload"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
};

export default ImageUpload;
