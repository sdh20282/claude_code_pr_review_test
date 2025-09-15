/**
 * 문자열 유틸리티 함수들 (난이도 1/10)
 * 간단한 문자열 조작 헬퍼 함수 모음
 */

// 문자열 뒤집기
function reverseString(str) {
  return str.split('').reverse().join('');
}

// 문자열이 팰린드롬인지 확인
function isPalindrome(str) {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === reverseString(cleaned);
}

// 첫 글자를 대문자로 변환
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// 단어 개수 세기
function countWords(str) {
  return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// 문자열 자르기 (말줄임표 추가)
function truncate(str, maxLength = 20) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// 문자열에서 모음 개수 세기
function countVowels(str) {
  const vowels = 'aeiouAEIOU';
  let count = 0;
  for (let char of str) {
    if (vowels.includes(char)) count++;
  }
  return count;
}

// 문자열 반복
function repeatString(str, times) {
  if (times < 0) return '';
  return str.repeat(times);
}

// kebab-case로 변환
function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

// 사용 예제
function examples() {
  console.log('=== String Utils Examples ===');

  console.log('Reverse "hello":', reverseString('hello'));
  console.log('Is "racecar" palindrome?:', isPalindrome('racecar'));
  console.log('Capitalize "javascript":', capitalize('javascript'));
  console.log('Word count "Hello world from JS":', countWords('Hello world from JS'));
  console.log('Truncate long text:', truncate('This is a very long text that needs truncating', 20));
  console.log('Vowels in "Hello World":', countVowels('Hello World'));
  console.log('Repeat "Hi" 3 times:', repeatString('Hi', 3));
  console.log('Convert to kebab:', toKebabCase('convertThisToKebab'));
}

// 모듈 내보내기
module.exports = {
  reverseString,
  isPalindrome,
  capitalize,
  countWords,
  truncate,
  countVowels,
  repeatString,
  toKebabCase,
  examples
};