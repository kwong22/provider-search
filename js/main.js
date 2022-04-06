let data;
let id2spec = [];
let lastSearchTerm;
let lastResultIds = [];
fetch('data/data.json')
  .then(response => response.json())
  .then(json => {
    data = json;

    // Filter by degree
    selectedDegs = ['MD', 'DO'];
    data = data.filter(d => {
      degs = d['name'].split(',').map(deg => deg.trim());
      return degs.some(deg => selectedDegs.includes(deg))
    });

    // Get unique specialties and sort alphabetically
    id2spec = [...new Set(data.map(({specialty}) => specialty))].sort();

    // Suffixes to exclude from clean name
    suffixes = ['Jr.', 'Jr', 'Sr.', 'I', 'II', 'III'];

    // Preprocess data
    data.forEach(d => {
      d.trunc_name = d['name'].split(',')[0].trim();

      // Produce clean version of name (array of strings)
      // - remove middle initials
      // - remove suffixes
      d.clean_name = d.trunc_name.split(/\s+/).filter(x => !(x.length == 2 && x.slice(-1) == '.'));
      while (d.clean_name.length > 0 && suffixes.includes(d.clean_name.slice(-1)[0])) {
        d.clean_name.pop();
      }

      // Encode words into pronunciation (array of arrays of strings)
      // produces an array of strings (pronunciations) for each word
      // only saves unique values, so array may contain 1 or 2 strings
      d.phone_name = d.clean_name.map(x => [...new Set(doubleMetaphone(x))]);

      d.key = d.trunc_name.toLowerCase().replace(/[^a-z]/g, '');
      d.spec_id = id2spec.indexOf(d.specialty);
    });

    // Sort providers by last name
    data.sort((a, b) => {
      name1 = a.clean_name.slice(-1)[0];
      name2 = b.clean_name.slice(-1)[0];
      return name1.localeCompare(name2, {ignorePunctuation: true});
    });

    // Initialize page with results
    updateResults(Array.from({length: 30}, (_, index) => index));
  })
  .catch(err => {
    console.log(err);
  })

const searchButton = document.querySelector('#search-btn');
searchButton.addEventListener('click', () => {
  searchProviders();
});

const resetButton = document.querySelector('#reset-btn');
resetButton.addEventListener('click', () => {
  resetResults();
});

window.addEventListener('keyup', event => {
  if (event.key == 'Enter') {
    searchProviders();
  }
});

// From https://www.tutorialspoint.com/levenshtein-distance-in-javascript
const levenshteinDistance = (str1 = '', str2 = '') => {
  const delCost = 1;
  const insCost = 1;
  const subCost = 1;
  
  const dp = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    dp[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j += 1) {
    dp[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : subCost;
      dp[j][i] = Math.min(
        dp[j][i - 1] + delCost, // deletion
        dp[j - 1][i] + insCost, // insertion
        dp[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  return dp[str2.length][str1.length];
};

function searchProviders() {
  let input = document.querySelector('#search-bar').value;

  // Ignore repeat searches
  if (input == lastSearchTerm) {
    return;
  }

  lastSearchTerm = input;
  
  // Run raw input through metaphone algorithm
  phoneInput = doubleMetaphone(input);
  console.log(phoneInput);

  // Sanitize input for regex
  input = input.trim().toLowerCase().replace(/[^a-z]/g, '');

  const THRESH = 0.6;
  const REGEX_BONUS = 0.5;

  const regex = new RegExp(input);

  resultIds = [];

  for (let i = 0; i < data.length; i++) {
    let foundMatch = false;
    let maxScore = 0;

    // Fuzzy match the pronunciations

    // Consider everything after the first name to be last names
    // so could potentially include middle names
    // each "last" name has an array of pronunciations
    lastNamesPhones = data[i].phone_name.slice(1);

    lastNamesPhones.forEach(lastNamePhones => {
      lastNamePhones.forEach(phone => {
        phoneInput.forEach(phoneInp => {
          dist = levenshteinDistance(phoneInp, phone);
          maxLen = Math.max(phoneInp.length, phone.length);

          // Calculate score based on edit distance and length of word
          // use to filter out and rank results
          score = (maxLen - dist) / maxLen;

          if (score >= THRESH) {
            foundMatch = true;
            maxScore = Math.max(score, maxScore);
          }
        });
      });
    });

    // Bonus for matching regex
    // Note: if regex is empty (no search input), then it matches all items
    if (regex.test(data[i].key)) {
      foundMatch = true;
      maxScore += REGEX_BONUS;
    }

    if (foundMatch) {
      resultIds.push([i, maxScore]);
    }
  }

  // Sort by score if input is not empty
  // Otherwise leave in alphabetical order
  if (input) {
    resultIds.sort((a, b) => a[1] - b[1]).reverse();
    console.log(resultIds.map(x => `${x[0]}: ${x[1]}`));
  }
  // Return id only
  resultIds = resultIds.map(x => x[0]);
  updateResults(resultIds);
}

function resetResults() {
  // Clear search bar and reset results
  searchBar = document.querySelector('#search-bar');
  searchBar.value = '';

  selectedSpec = document.querySelector('.spec-btn.active');
  if (selectedSpec) {
    toggleSpec(selectedSpec.value);
  }

  // Perform search only if previous search was different
  if (lastResultIds.length != data.length) {
    searchProviders();
  }
}

function toggleSpec(specId) {
  const buttons = document.querySelectorAll('.spec-btn');

  let specSelected = false;

  // Toggle current spec and deactivate the rest
  buttons.forEach(button => {
    if (button.value == specId) {
      button.classList.toggle('active');
      specSelected = button.classList.contains('active');
    } else {
      button.classList.remove('active');
    }
  });

  let resultIds;
  if (specSelected) {
    resultIds = lastResultIds.filter(resId => data[resId].spec_id == specId);
  } else {
    // If no specialty selected, then show all results
    resultIds = lastResultIds;
  }

  // Show updated results
  updateCount(resultIds.length);
  showResults(resultIds);
}

function updateCount(count) {
  const counter = document.querySelector('#results-count');

  let str = 'results';
  if (count == 1) {
    str = 'result';
  }

  counter.innerHTML = `${count} ${str} found.`;
}

function updateSpecs(resultIds) {
  let specCounts = Array(id2spec.length).fill(0);

  resultIds.forEach(resId => {
    specCounts[data[resId].spec_id] += 1;
  });

  let elements = [];
  for (let i = 0; i < specCounts.length; i++) {
    if (specCounts[i] > 0) {
      const str = `<div class="spec"><button class="spec-btn noselect pointer" value="${i}" onclick="toggleSpec(${i})">${id2spec[i]} (${specCounts[i]})</button></div>`;
      elements.push(str);
    }
  }

  const container = document.querySelector('#specs');
  container.innerHTML = elements.join('');
}

function updateResults(resultIds) {
  updateCount(resultIds.length);

  updateSpecs(resultIds);

  showResults(resultIds);

  lastResultIds = resultIds;
}

function showResults(resultIds) {
  let elements = [];
  resultIds.forEach(resId => {
    const str = `<div class="result noselect"><div class="result-name">${data[resId].name}</div><div class="result-spec">${data[resId].specialty}</div></div>`;
    elements.push(str);
  });

  const container = document.querySelector('#results');
  container.innerHTML = elements.join('');
}
