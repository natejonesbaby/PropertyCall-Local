/**
 * Timezone utility functions for Property Call
 * Detects timezone based on US state
 */

/**
 * Map of US states to their IANA timezones
 * Uses the most common timezone for each state
 */
const STATE_TIMEZONE_MAP = {
  // Eastern Time Zone
  'CT': 'America/New_York',    // Connecticut
  'DE': 'America/New_York',    // Delaware
  'DC': 'America/New_York',    // District of Columbia
  'FL': 'America/New_York',    // Florida
  'GA': 'America/New_York',    // Georgia
  'IN': 'America/Indiana/Indianapolis', // Indiana
  'KY': 'America/New_York',    // Kentucky (eastern part)
  'ME': 'America/New_York',    // Maine
  'MD': 'America/New_York',    // Maryland
  'MA': 'America/New_York',    // Massachusetts
  'MI': 'America/Detroit',     // Michigan
  'NH': 'America/New_York',    // New Hampshire
  'NJ': 'America/New_York',    // New Jersey
  'NY': 'America/New_York',    // New York
  'NC': 'America/New_York',    // North Carolina
  'OH': 'America/New_York',    // Ohio
  'PA': 'America/New_York',    // Pennsylvania
  'RI': 'America/New_York',    // Rhode Island
  'SC': 'America/New_York',    // South Carolina
  'VT': 'America/New_York',    // Vermont
  'VA': 'America/New_York',    // Virginia
  'WV': 'America/New_York',    // West Virginia

  // Central Time Zone
  'AL': 'America/Chicago',     // Alabama
  'AR': 'America/Chicago',     // Arkansas
  'IL': 'America/Chicago',     // Illinois
  'IA': 'America/Chicago',     // Iowa
  'KS': 'America/Chicago',     // Kansas
  'LA': 'America/Chicago',     // Louisiana
  'MN': 'America/Chicago',     // Minnesota
  'MS': 'America/Chicago',     // Mississippi
  'MO': 'America/Chicago',     // Missouri
  'NE': 'America/Chicago',     // Nebraska
  'ND': 'America/Chicago',     // North Dakota
  'OK': 'America/Chicago',     // Oklahoma
  'SD': 'America/Chicago',     // South Dakota
  'TN': 'America/Chicago',     // Tennessee
  'TX': 'America/Chicago',     // Texas
  'WI': 'America/Chicago',     // Wisconsin

  // Mountain Time Zone
  'AZ': 'America/Phoenix',     // Arizona (no DST)
  'CO': 'America/Denver',      // Colorado
  'ID': 'America/Denver',      // Idaho (southern)
  'MT': 'America/Denver',      // Montana
  'NM': 'America/Denver',      // New Mexico
  'UT': 'America/Denver',      // Utah
  'WY': 'America/Denver',      // Wyoming

  // Pacific Time Zone
  'CA': 'America/Los_Angeles', // California
  'NV': 'America/Los_Angeles', // Nevada
  'OR': 'America/Los_Angeles', // Oregon
  'WA': 'America/Los_Angeles', // Washington

  // Alaskan Time Zone
  'AK': 'America/Anchorage',   // Alaska

  // Hawaiian Time Zone
  'HI': 'Pacific/Honolulu',    // Hawaii

  // Territories
  'PR': 'America/Puerto_Rico', // Puerto Rico
  'VI': 'America/St_Thomas',   // Virgin Islands
  'GU': 'Pacific/Guam',        // Guam
  'AS': 'Pacific/Pago_Pago',   // American Samoa
  'MP': 'Pacific/Saipan',      // Northern Mariana Islands
};

/**
 * Get timezone from state code
 * @param {string} state - Two-letter state code (e.g., 'CA', 'NY')
 * @returns {string|null} IANA timezone string or null if not found
 */
function getTimezoneFromState(state) {
  if (!state) return null;

  // Clean up the state input
  const stateCode = state.toString().toUpperCase().trim();

  // Check if it's already a 2-letter code
  if (stateCode.length === 2 && STATE_TIMEZONE_MAP[stateCode]) {
    return STATE_TIMEZONE_MAP[stateCode];
  }

  // Try to match full state names
  const stateNameMap = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
    'puerto rico': 'PR', 'virgin islands': 'VI', 'guam': 'GU',
    'american samoa': 'AS', 'northern mariana islands': 'MP'
  };

  const lowerState = stateCode.toLowerCase();
  if (stateNameMap[lowerState]) {
    return STATE_TIMEZONE_MAP[stateNameMap[lowerState]];
  }

  // Not found
  return null;
}

/**
 * Get timezone for a lead based on their property state
 * @param {object} lead - Lead object with property_state field
 * @returns {string} IANA timezone string (defaults to America/New_York)
 */
function getTimezoneForLead(lead) {
  const state = lead?.property_state;
  const timezone = getTimezoneFromState(state);

  // Default to Eastern Time if not found
  return timezone || 'America/New_York';
}

/**
 * Check if current time is within calling hours for a given timezone
 * @param {string} timezone - IANA timezone string
 * @param {string} startTime - Start time in HH:MM format (e.g., '09:00')
 * @param {string} endTime - End time in HH:MM format (e.g., '19:00')
 * @returns {boolean} True if current time is within calling hours
 */
function isWithinCallingHours(timezone, startTime = '09:00', endTime = '19:00') {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const currentTime = formatter.format(now);
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('Error checking calling hours:', error);
    return true; // Default to allowing calls if there's an error
  }
}

export {
  STATE_TIMEZONE_MAP,
  getTimezoneFromState,
  getTimezoneForLead,
  isWithinCallingHours
};
