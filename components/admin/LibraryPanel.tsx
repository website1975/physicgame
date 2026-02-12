
import React from 'react';
import ExamLibrary from '../ExamLibrary';

interface LibraryPanelProps {
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onRefresh: () => void;
  teacherId: string;
  teacherSubject?: string;
  isLoadingSets?: boolean;
  onEdit: (id: string, title: string) => void;
  onLive: (id: string, title: string) => void;
}

const LibraryPanel: React.FC<LibraryPanelProps> = (props) => {
  return (
    <div className="h-full flex flex-col">
       <ExamLibrary 
         {...props}
         onDistribute={() => {}} 
       />
    </div>
  );
};

export default LibraryPanel;
