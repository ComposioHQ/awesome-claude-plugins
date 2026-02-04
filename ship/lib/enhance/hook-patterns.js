/**
 * Hook patterns for /enhance.
 */

const hookPatterns = {
  missing_frontmatter: {
    id: 'missing_frontmatter',
    certainty: 'HIGH',
    check(content) {
      if (!content || !content.trim().startsWith('---')) {
        return { issue: 'Missing YAML frontmatter in hook file' };
      }
      return null;
    }
  },
  missing_name: {
    id: 'missing_name',
    certainty: 'HIGH',
    check(frontmatter) {
      if (!frontmatter || !frontmatter.name) {
        return { issue: 'Missing name in hook frontmatter' };
      }
      return null;
    }
  },
  missing_description: {
    id: 'missing_description',
    certainty: 'HIGH',
    check(frontmatter) {
      if (!frontmatter || !frontmatter.description) {
        return { issue: 'Missing description in hook frontmatter' };
      }
      return null;
    }
  }
};

module.exports = {
  hookPatterns
};
