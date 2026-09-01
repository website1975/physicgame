export interface WeekNode {
  id: string;
  name: string; // e.g. "Đề ôn tuần 1: Sai số & Đo lường"
  custom?: boolean;
}

export interface ChapterNode {
  id: string;
  name: string; // e.g. "Chương 1: Mở đầu & Đo lường"
  weeks: WeekNode[];
  custom?: boolean;
}

export interface GradeCurriculum {
  grade: string; // "10", "11", "12"
  chapters: ChapterNode[];
}

export interface WeekOption {
  id: string;
  weekName: string;
  chapterName: string;
  grade: string;
  combinedTopic: string;
}

// Default High School Physics Curriculum GDPT 2018
export const DEFAULT_PHYSICS_CURRICULUM: GradeCurriculum[] = [
  {
    grade: '10',
    chapters: [
      {
        id: 'c10_1',
        name: 'Chương 1: Mở đầu & Phép đo trong Vật lý',
        weeks: [
          { id: 'c10_1_w1', name: 'Đề ôn tuần 1: Quy tắc an toàn & Sai số phép đo' },
          { id: 'c10_1_w2', name: 'Đề ôn tuần 2: Các đại lượng và đơn vị đo' },
        ]
      },
      {
        id: 'c10_2',
        name: 'Chương 2: Động học chất điểm',
        weeks: [
          { id: 'c10_2_w3', name: 'Đề ôn tuần 3: Độ dịch chuyển & Vận tốc' },
          { id: 'c10_2_w4', name: 'Đề ôn tuần 4: Chuyển động thẳng biến đổi đều' },
          { id: 'c10_2_w5', name: 'Đề ôn tuần 5: Rơi tự do & Ném ngang' },
        ]
      },
      {
        id: 'c10_3',
        name: 'Chương 3: Động lực học',
        weeks: [
          { id: 'c10_3_w6', name: 'Đề ôn tuần 6: Tổng hợp lực & 3 Định luật Newton' },
          { id: 'c10_3_w7', name: 'Đề ôn tuần 7: Lực ma sát, Trọng lực & Đàn hồi' },
          { id: 'c10_3_w8', name: 'Đề ôn tuần 8: Cân bằng lực và Moment lực' },
        ]
      },
      {
        id: 'c10_4',
        name: 'Chương 4: Năng lượng, Công & Công suất',
        weeks: [
          { id: 'c10_4_w9', name: 'Đề ôn tuần 9: Công cơ học và Công suất' },
          { id: 'c10_4_w10', name: 'Đề ôn tuần 10: Động năng, Thế năng & Bảo toàn cơ năng' },
        ]
      },
      {
        id: 'c10_5',
        name: 'Chương 5: Động lượng & Va chạm',
        weeks: [
          { id: 'c10_5_w11', name: 'Đề ôn tuần 11: Động lượng và Định luật bảo toàn động lượng' },
        ]
      },
      {
        id: 'c10_6',
        name: 'Chương 6: Chuyển động tròn & Biến dạng',
        weeks: [
          { id: 'c10_6_w12', name: 'Đề ôn tuần 12: Động học & Động lực học chuyển động tròn' },
          { id: 'c10_6_w13', name: 'Đề ôn tuần 13: Biến dạng của vật rắn & Định luật Hooke' },
        ]
      }
    ]
  },
  {
    grade: '11',
    chapters: [
      {
        id: 'c11_1',
        name: 'Chương 1: Dao động cơ',
        weeks: [
          { id: 'c11_1_w1', name: 'Đề ôn tuần 1: Dao động điều hòa' },
          { id: 'c11_1_w2', name: 'Đề ôn tuần 2: Con lắc lò xo & Con lắc đơn' },
          { id: 'c11_1_w3', name: 'Đề ôn tuần 3: Năng lượng trong dao động điều hòa' },
        ]
      },
      {
        id: 'c11_2',
        name: 'Chương 2: Sóng cơ & Sóng âm',
        weeks: [
          { id: 'c11_2_w4', name: 'Đề ôn tuần 4: Sự truyền sóng cơ' },
          { id: 'c11_2_w5', name: 'Đề ôn tuần 5: Giao thoa sóng & Sóng dừng' },
          { id: 'c11_2_w6', name: 'Đề ôn tuần 6: Sóng điện từ & Sóng âm' },
        ]
      },
      {
        id: 'c11_3',
        name: 'Chương 3: Điện trường & Dòng điện không đổi',
        weeks: [
          { id: 'c11_3_w7', name: 'Đề ôn tuần 7: Điện trường, Điện thế & Tụ điện' },
          { id: 'c11_3_w8', name: 'Đề ôn tuần 8: Dòng điện không đổi & Định luật Ohm' },
        ]
      },
      {
        id: 'c11_4',
        name: 'Chương 4: Từ trường & Cảm ứng điện từ',
        weeks: [
          { id: 'c11_4_w9', name: 'Đề ôn tuần 9: Từ trường và Lực từ' },
          { id: 'c11_4_w10', name: 'Đề ôn tuần 10: Hiện tượng cảm ứng điện từ' },
        ]
      }
    ]
  },
  {
    grade: '12',
    chapters: [
      {
        id: 'c12_1',
        name: 'Chương 1: Vật lý nhiệt',
        weeks: [
          { id: 'c12_1_w1', name: 'Đề ôn tuần 1: Cấu trúc chất & Mô hình động học phân tử' },
          { id: 'c12_1_w2', name: 'Đề ôn tuần 2: Nội năng, Nhiệt lượng & Định luật nhiệt động lực học' },
          { id: 'c12_1_w3', name: 'Đề ôn tuần 3: Nhiệt dung riêng, Nhiệt nóng chảy & Nhiệt hóa hơi' },
        ]
      },
      {
        id: 'c12_2',
        name: 'Chương 2: Khí lý tưởng',
        weeks: [
          { id: 'c12_2_w4', name: 'Đề ôn tuần 4: Các định luật chất khí (Boyle, Charles)' },
          { id: 'c12_2_w5', name: 'Đề ôn tuần 5: Phương trình trạng thái khí lý tưởng' },
        ]
      },
      {
        id: 'c12_3',
        name: 'Chương 3: Từ trường & Hiện tượng cảm ứng',
        weeks: [
          { id: 'c12_3_w6', name: 'Đề ôn tuần 6: Cảm ứng từ & Lực từ' },
          { id: 'c12_3_w7', name: 'Đề ôn tuần 7: Hiện tượng cảm ứng điện từ & Tự cảm' },
        ]
      },
      {
        id: 'c12_4',
        name: 'Chương 4: Vật lý hạt nhân',
        weeks: [
          { id: 'c12_4_w8', name: 'Đề ôn tuần 8: Cấu trúc hạt nhân & Năng lượng liên kết' },
          { id: 'c12_4_w9', name: 'Đề ôn tuần 9: Phóng xạ & Phản ứng hạt nhân' },
        ]
      }
    ]
  }
];

export function getCurriculumTree(teacherId?: string): GradeCurriculum[] {
  if (typeof window === 'undefined') {
    return DEFAULT_PHYSICS_CURRICULUM;
  }
  try {
    if (teacherId) {
      const raw1 = localStorage.getItem(`physiquest_curriculum_${teacherId}`);
      if (raw1) {
        const parsed = JSON.parse(raw1);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const raw2 = localStorage.getItem(`curriculum_tree_${teacherId}`);
      if (raw2) {
        const parsed = JSON.parse(raw2);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
    const rawGlobal = localStorage.getItem('physiquest_curriculum_global');
    if (rawGlobal) {
      const parsed = JSON.parse(rawGlobal);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading curriculum from local storage', e);
  }
  return DEFAULT_PHYSICS_CURRICULUM;
}

export function saveCurriculumTree(teacherId: string, tree: GradeCurriculum[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (teacherId) {
      localStorage.setItem(`physiquest_curriculum_${teacherId}`, JSON.stringify(tree));
      localStorage.setItem(`curriculum_tree_${teacherId}`, JSON.stringify(tree));
    }
    localStorage.setItem('physiquest_curriculum_global', JSON.stringify(tree));
    window.dispatchEvent(new CustomEvent('physiquest_curriculum_updated', { detail: { teacherId, tree } }));
  } catch (e) {
    console.error('Error saving curriculum tree', e);
  }
}

export function getChaptersForGrade(grade: string, teacherId?: string): ChapterNode[] {
  const tree = getCurriculumTree(teacherId);
  const found = tree.find(g => String(g.grade) === String(grade));
  return found ? found.chapters : [];
}

/**
 * Returns all weeks for a given grade grouped by chapter
 */
export function getAllWeeksForGrade(grade: string, teacherId?: string): { chapter: ChapterNode; weeks: WeekNode[] }[] {
  const chapters = getChaptersForGrade(grade, teacherId);
  return chapters.map(chap => ({
    chapter: chap,
    weeks: chap.weeks
  }));
}

/**
 * Finds chapter and week from a combined topic string
 */
export function findChapterAndWeekForTopic(topic: string, grade: string, teacherId?: string): { chapter: string; week: string } {
  if (!topic || !topic.trim()) return { chapter: '', week: '' };
  const chapters = getChaptersForGrade(grade, teacherId);
  const norm = topic.toLowerCase().trim();

  // 1. If topic has explicit ' - ' delimiter, separate chapter and week
  if (topic.includes(' - ')) {
    const parts = topic.split(' - ');
    const chapPart = parts[0].trim();
    const weekPart = parts.slice(1).join(' - ').trim();

    // Check if chapPart matches any known chapter
    const matchedChap = chapters.find(c => {
      const cNorm = c.name.toLowerCase().trim();
      const cKeywords = c.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
      const cpNorm = chapPart.toLowerCase();
      return cNorm === cpNorm || cKeywords === cpNorm || cNorm.includes(cpNorm) || cpNorm.includes(cNorm);
    });

    if (matchedChap) {
      const matchedWeek = matchedChap.weeks.find(w => {
        const wNorm = w.name.toLowerCase().trim();
        const wpNorm = weekPart.toLowerCase();
        return wNorm === wpNorm || wNorm.includes(wpNorm) || wpNorm.includes(wNorm);
      });
      return {
        chapter: matchedChap.name,
        week: matchedWeek ? matchedWeek.name : weekPart
      };
    }

    return { chapter: chapPart, week: weekPart };
  }

  // 2. Exact match of whole topic to chapter name
  for (const chap of chapters) {
    const normC = chap.name.toLowerCase().trim();
    const cKeywords = chap.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
    if (norm === normC || norm === cKeywords) {
      return { chapter: chap.name, week: '' };
    }
  }

  // 3. Partial match of topic to chapter name
  for (const chap of chapters) {
    const normC = chap.name.toLowerCase().trim();
    const cKeywords = chap.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
    if ((normC.length > 4 && norm.includes(normC)) || (cKeywords.length > 4 && norm.includes(cKeywords))) {
      return { chapter: chap.name, week: '' };
    }
  }

  // 4. Try to match specific week name (only if specific)
  for (const chap of chapters) {
    for (const w of chap.weeks) {
      const normW = w.name.toLowerCase().trim();
      const wKeywords = w.name.replace(/^Đề ôn\s*(tuần\s*\d+)?(:|\s*-\s*)?/i, '').trim().toLowerCase();
      if (wKeywords.length > 4 && norm.includes(wKeywords)) {
        return { chapter: chap.name, week: w.name };
      }
    }
  }

  return { chapter: topic.trim(), week: '' };
}

export function splitTopic(topic: string, grade: string, teacherId?: string): { chapter: string; week: string } {
  return findChapterAndWeekForTopic(topic, grade, teacherId);
}

export function joinTopic(chapter: string, week?: string): string {
  if (!chapter && !week) return '';
  if (!chapter) return week || '';
  if (!week) return chapter;
  return `${chapter} - ${week}`;
}

/**
 * Deterministically maps an exam set into a chapter and optionally a week within that chapter
 */
export function matchExamToCurriculum(
  set: { id: string; title?: string; topic?: string; grade?: string },
  chapters: ChapterNode[]
): { chapterId: string; weekId: string | null } | null {
  const topic = (set.topic || '').trim();
  const title = (set.title || '').trim();
  const topicLower = topic.toLowerCase();
  const titleLower = title.toLowerCase();

  if (!topic && !title) return null;

  // 1. If topic contains explicit ' - ' separator
  if (topic.includes(' - ')) {
    const parts = topic.split(' - ');
    const chapterPart = parts[0].trim().toLowerCase();
    const weekPart = parts.slice(1).join(' - ').trim().toLowerCase();

    const matchedChap = chapters.find(c => {
      const cName = c.name.toLowerCase();
      const cKeywords = c.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
      return (
        cName === chapterPart ||
        cKeywords === chapterPart ||
        cName.includes(chapterPart) ||
        chapterPart.includes(cName) ||
        (cKeywords.length > 3 && chapterPart.includes(cKeywords))
      );
    });

    if (matchedChap) {
      const matchedWeek = matchedChap.weeks.find(w => {
        const wName = w.name.toLowerCase();
        const wKeywords = w.name.replace(/^Đề ôn\s*/i, '').trim().toLowerCase();
        return (
          wName === weekPart ||
          wKeywords === weekPart ||
          wName.includes(weekPart) ||
          weekPart.includes(wName)
        );
      });

      return {
        chapterId: matchedChap.id,
        weekId: matchedWeek ? matchedWeek.id : null
      };
    }
  }

  // 2. Exact match of topic with a chapter name
  for (const c of chapters) {
    if (c.name.toLowerCase() === topicLower) {
      return { chapterId: c.id, weekId: null };
    }
  }

  // 3. Match chapter by name/keywords, and then check if week is inside that chapter
  for (const c of chapters) {
    const cName = c.name.toLowerCase();
    const cKeywords = c.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
    const chapMatches =
      topicLower === cName ||
      topicLower === cKeywords ||
      (cName.length > 3 && topicLower.includes(cName)) ||
      (cKeywords.length > 3 && topicLower.includes(cKeywords));

    if (chapMatches) {
      for (const w of c.weeks) {
        const wName = w.name.toLowerCase();
        const wKeywords = w.name.replace(/^Đề ôn\s*/i, '').trim().toLowerCase();
        if (
          topicLower.includes(wName) ||
          (wKeywords.length > 3 && topicLower.includes(wKeywords)) ||
          titleLower.includes(wName)
        ) {
          return { chapterId: c.id, weekId: w.id };
        }
      }
      return { chapterId: c.id, weekId: null };
    }
  }

  // 4. Match chapter if chapter name or keyword is in topic or title
  for (const c of chapters) {
    const cName = c.name.toLowerCase();
    const cKeywords = c.name.replace(/^Chương\s*\d+:\s*/i, '').trim().toLowerCase();
    if (
      (cKeywords.length > 3 && (topicLower.includes(cKeywords) || titleLower.includes(cKeywords))) ||
      (topicLower.length > 3 && cKeywords.includes(topicLower)) ||
      (cName.length > 3 && (topicLower.includes(cName) || titleLower.includes(cName)))
    ) {
      return { chapterId: c.id, weekId: null };
    }
  }

  // 5. Fallback: match specific week keyword
  for (const c of chapters) {
    for (const w of c.weeks) {
      const wKeywords = w.name.replace(/^Đề ôn\s*(tuần\s*\d+)?(:|\s*-\s*)?/i, '').trim().toLowerCase();
      if (wKeywords.length > 4 && (topicLower.includes(wKeywords) || titleLower.includes(wKeywords))) {
        return { chapterId: c.id, weekId: w.id };
      }
    }
  }

  return null;
}
