import React from 'react';

interface AudioUploadProps {
  onFileChange: (file: File) => void;
  disabled?: boolean;
}

const AudioUpload: React.FC<AudioUploadProps> = ({ onFileChange, disabled }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileChange(event.target.files[0]);
      // Reset file input to allow uploading the same file again
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="my-4">
      <label
        htmlFor="audio-upload"
        className={`px-6 py-3 rounded-lg shadow-md cursor-pointer transition-all duration-150 ease-in-out text-base font-medium
        ${
          disabled
            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
            : 'bg-sky-600 hover:bg-sky-700 text-white focus-within:ring-2 focus-within:ring-sky-400 focus-within:ring-opacity-75'
        }`}
      >
        {disabled ? 'Processing...' : 'Upload Audio File'}
      </label>
      <input
        id="audio-upload"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
};

export default AudioUpload;
