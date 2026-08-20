/**
 * Azar Project Team - Learning Tracks Section Controller
 * This file contains the vanilla JS logic to fetch, group, calculate,
 * and dynamically render the course tracks UI using Tailwind CSS.
 */

// Normalizes name comparing: replace hyphen with spaces, lowercase, trim.
function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/-/g, ' ').trim();
}

/**
 * 1. Backend Data Fetching
 * Fetches the raw flat learning tracks array from the Google Apps Script Web App.
 * @param {string} apiUrl - The Google Apps Script deployment URL.
 * @returns {Promise<Array>} Flat course list.
 */
async function fetchLearningData(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}?action=learning`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch learning track database:", error);
    throw error;
  }
}

/**
 * 2. Grouping & Metrics Calculation
 * Transforms flat course entries into grouped tracks, calculating track-level
 * and user completion statistics dynamically.
 * 
 * @param {Array} courses - Flat course array from the database.
 * @param {Array} logs - Completed event logs database.
 * @param {Object} currentUser - Active logged-in team member.
 * @returns {Array} Grouped track array.
 */
function groupCoursesByTrack(courses, logs, currentUser) {
  const nameNorm = currentUser ? normalizeName(currentUser.Name) : '';
  const tracksMap = {};

  courses.forEach(course => {
    // Standardize IDs and strings
    const trackIdRaw = course["Track ID"];
    const trackId = trackIdRaw !== undefined && trackIdRaw !== null && trackIdRaw !== '' ? parseFloat(trackIdRaw) : null;
    if (trackId === null || isNaN(trackId)) return; // Skip rows without valid Track ID

    const trackName = (course["Track Name"] || 'Unassigned Track').trim().replace(/\n/g, '');
    const trackOverview = course["Track Overview"] || 'Track details are currently being scheduled.';
    const courseName = course["Course Name"] || course["Topic name"] || '';

    // Initialize track group if not existing
    if (!tracksMap[trackId]) {
      tracksMap[trackId] = {
        trackId,
        trackName,
        trackOverview,
        courses: []
      };
    }

    // Capture the overview if available in current row
    if (trackOverview && (!tracksMap[trackId].trackOverview || tracksMap[trackId].trackOverview.startsWith('Track details are currently'))) {
      tracksMap[trackId].trackOverview = trackOverview;
    }

    // Only add course object if courseName is present
    if (courseName && courseName.trim()) {
      // Calculate completion dynamically by matching event log name and attendees
      const isCompleted = logs.some(log => 
        (log["Event Type"] === 'Learning' || log["Event Type"] === 'Skill') && 
        normalizeName(log["Event Name"]) === normalizeName(courseName) &&
        log["Attendees/Completed"] && 
        log["Attendees/Completed"].split('\n').some(c => normalizeName(c) === nameNorm)
      );

      const isMandatory = (course["Mandatory/Optional"] || course["Obligability"] || '').trim().toLowerCase() === 'mandatory';
      const estimatedHours = parseFloat(course["Estimated Hours"]) || 0;
      const courseUrl = course["Course URL"] || course["Link"] || '';
      const platform = course["Platform"] || '';

      tracksMap[trackId].courses.push({
        courseName: courseName.trim(),
        isMandatory,
        estimatedHours,
        courseUrl,
        platform,
        isCompleted
      });
    }
  });

  // Convert to sorted array
  const tracks = Object.values(tracksMap).sort((a, b) => a.trackId - b.trackId);

  // Calculate statistics for each group
  tracks.forEach(track => {
    const totalCourses = track.courses.length;
    const completedCourses = track.courses.filter(c => c.isCompleted).length;
    const completionPercentage = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

    const mandatoryCourses = track.courses.filter(c => c.isMandatory);
    const totalMandatory = mandatoryCourses.length;
    const completedMandatory = mandatoryCourses.filter(c => c.isCompleted).length;

    track.metrics = {
      totalCourses,
      completedCourses,
      completionPercentage,
      totalMandatory,
      completedMandatory
    };
  });

  return tracks;
}

/**
 * 3. UI Generation with ES6 Template Literals
 * Generates beautiful SaaS-themed layout, mapping track containers and milestones.
 * 
 * @param {HTMLElement} containerElement - Element to inject HTML into.
 * @param {Array} courses - Flat course array.
 * @param {Array} logs - Team completed logs array.
 * @param {Object} currentUser - Logged-in team member.
 */
function renderLearningTracks(containerElement, courses, logs, currentUser) {
  if (!containerElement) return;

  const groupedTracks = groupCoursesByTrack(courses, logs, currentUser);

  // Theme colors matching track IDs dynamically
  const trackThemeColors = [
    { border: 'border-orange-200 focus-within:border-orange-400', headerBg: 'bg-orange-50/50', badge: 'bg-orange-100 text-orange-800' },
    { border: 'border-blue-200 focus-within:border-blue-400', headerBg: 'bg-blue-50/50', badge: 'bg-blue-100 text-blue-800' },
    { border: 'border-emerald-200 focus-within:border-emerald-400', headerBg: 'bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-800' },
    { border: 'border-purple-200 focus-within:border-purple-400', headerBg: 'bg-purple-50/50', badge: 'bg-purple-100 text-purple-800' },
    { border: 'border-pink-200 focus-within:border-pink-400', headerBg: 'bg-pink-50/50', badge: 'bg-pink-100 text-pink-800' },
    { border: 'border-amber-200 focus-within:border-amber-400', headerBg: 'bg-amber-50/50', badge: 'bg-amber-100 text-amber-800' },
    { border: 'border-cyan-200 focus-within:border-cyan-400', headerBg: 'bg-cyan-50/50', badge: 'bg-cyan-100 text-cyan-800' },
    { border: 'border-indigo-200 focus-within:border-indigo-400', headerBg: 'bg-indigo-50/50', badge: 'bg-indigo-100 text-indigo-800' },
    { border: 'border-rose-200 focus-within:border-rose-400', headerBg: 'bg-rose-50/50', badge: 'bg-rose-100 text-rose-800' },
  ];

  const htmlContent = groupedTracks.map((track, index) => {
    const color = trackThemeColors[index % trackThemeColors.length];
    
    // Check if track has courses
    const hasCourses = track.courses.length > 0;
    
    // Check if mandatory metrics are 100% complete
    const isMandatoryComplete = track.metrics.totalMandatory > 0 && track.metrics.completedMandatory === track.metrics.totalMandatory;

    // Course Cards Generation
    const coursesHtml = hasCourses ? track.courses.map(course => `
      <div class="border rounded-xl p-5 flex flex-col justify-between transition-all duration-300 shadow-sm ${
        course.isCompleted
          ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-slate-100 bg-white hover:border-brand-200 hover:shadow-saas'
      }">
        <div class="space-y-4">
          <!-- Card Badges -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                course.isMandatory
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : 'bg-blue-100 text-blue-700 border border-blue-200'
              }">
                ${course.isMandatory ? 'MANDATORY' : 'OPTIONAL'}
              </span>
              <span class="text-[9px] font-extrabold text-slate-500 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md uppercase tracking-wider">
                ⏱ ${course.estimatedHours} Hours
              </span>
              ${course.platform ? `
                <span class="text-[9px] font-extrabold text-purple-700 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-md uppercase tracking-wider">
                  ☁️ ${course.platform}
                </span>
              ` : ''}
            </div>
            
            ${course.isCompleted ? `
              <span class="text-[9px] font-extrabold text-emerald-700 px-2 py-0.5 bg-emerald-100 border border-emerald-200 rounded-md uppercase tracking-wider">
                ✓ Done
              </span>
            ` : ''}
          </div>

          <!-- Card Content -->
          <div class="space-y-1">
            <h4 class="text-sm font-extrabold text-slate-800 leading-snug">${course.courseName}</h4>
            <p class="text-[11px] text-slate-400 font-medium leading-relaxed">
              Accelerate skills in ${track.trackName} (${course.platform || 'General'}). Complete assignments to validate credentials.
            </p>
          </div>
        </div>

        <!-- Card Action -->
        <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          ${course.courseUrl ? `
            <a href="${course.courseUrl}" target="_blank" class="text-[11px] font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors group">
              Launch Course
              <span class="transform transition-transform group-hover:translate-x-1">→</span>
            </a>
          ` : `
            <span class="text-[10px] text-slate-400 font-semibold">Link Not Scheduled</span>
          `}
        </div>
      </div>
    `).join('') : `
      <div class="col-span-full border border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50">
        <span class="text-slate-300 text-3xl mb-2">📅</span>
        <h5 class="text-xs font-extrabold text-slate-700">Tracks Scheduled For Future Releases</h5>
        <p class="text-[10px] text-slate-400 font-bold max-w-xs mt-1 leading-relaxed">
          Course curriculum and assignments are currently being structured and will align with subsequent milestone phases.
        </p>
      </div>
    `;

    // Milestone Divider (exclude for last track)
    const dividerHtml = (index < groupedTracks.length - 1) ? `
      <div class="relative py-8">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
          <div class="w-full border-t border-dashed border-slate-200"></div>
        </div>
        <div class="relative flex justify-center">
          <span class="bg-[#fcfcfd] px-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border border-slate-100 rounded-full py-1 shadow-sm flex items-center gap-1.5">
            🎯 NEXT MILESTONE PHASE
          </span>
        </div>
      </div>
    ` : '';

    return `
      <!-- Track ${track.trackId} -->
      <div class="border rounded-2xl p-6 bg-white shadow-saas space-y-6 ${color.border}">
        <!-- Track Header -->
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div class="space-y-1 md:max-w-[65%]">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${color.badge}">
                TRACK ${track.trackId}
              </span>
            </div>
            <h3 class="text-base font-black text-slate-900 mt-1">${track.trackName}</h3>
            <p class="text-xs text-slate-400 font-bold leading-relaxed">${track.trackOverview}</p>
          </div>
          
          <!-- Track Progress Indicator -->
          <div class="flex flex-col items-end gap-1.5 min-w-[220px] text-right">
            <div class="flex items-center gap-2">
              <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                isMandatoryComplete
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-rose-50 text-rose-700 border border-rose-100'
              }">
                ${isMandatoryComplete ? '🟢' : '🔴'} ${track.metrics.completedMandatory}/${track.metrics.totalMandatory} Mand
              </span>
              <span class="text-xs font-extrabold text-slate-700">
                ${track.metrics.completedCourses} of ${track.metrics.totalCourses} Courses
              </span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1 relative">
              <div class="bg-brand-500 h-full rounded-full transition-all duration-500" style="width: ${track.metrics.completionPercentage}%"></div>
            </div>
            <span class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              ${track.metrics.completionPercentage}% Complete
            </span>
          </div>
        </div>

        <!-- Course Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${coursesHtml}
        </div>
      </div>

      ${dividerHtml}
    `;
  }).join('');

  containerElement.innerHTML = `<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">${htmlContent}</div>`;
}
