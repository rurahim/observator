import React, { createContext, useContext, useState, useCallback } from 'react';

interface FilterState {
  emirate: string;
  sector: string;
  dateRange: string;
  gender: string;
  experience: string;
  nationality: string;
  dataSource: string;
}

interface FilterContextType {
  filters: FilterState;
  setEmirate: (v: string) => void;
  setSector: (v: string) => void;
  setDateRange: (v: string) => void;
  setGender: (v: string) => void;
  setExperience: (v: string) => void;
  setNationality: (v: string) => void;
  setDataSource: (v: string) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

const defaults: FilterState = {
  emirate: 'all',
  sector: 'all',
  dateRange: 'Last 12 Months',
  gender: 'All',
  experience: 'All Levels',
  nationality: 'All',
  dataSource: 'all',
};

const FilterContext = createContext<FilterContextType>({
  filters: defaults,
  setEmirate: () => {},
  setSector: () => {},
  setDateRange: () => {},
  setGender: () => {},
  setExperience: () => {},
  setNationality: () => {},
  setDataSource: () => {},
  resetFilters: () => {},
  hasActiveFilters: false,
});

export const useFilters = () => useContext(FilterContext);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<FilterState>(defaults);

  const setEmirate = useCallback((emirate: string) =>
    setFilters(prev => ({ ...prev, emirate })), []);

  const setSector = useCallback((sector: string) =>
    setFilters(prev => ({ ...prev, sector })), []);

  const setDateRange = useCallback((dateRange: string) =>
    setFilters(prev => ({ ...prev, dateRange })), []);

  const setGender = useCallback((gender: string) =>
    setFilters(prev => ({ ...prev, gender })), []);

  const setExperience = useCallback((experience: string) =>
    setFilters(prev => ({ ...prev, experience })), []);

  const setNationality = useCallback((nationality: string) =>
    setFilters(prev => ({ ...prev, nationality })), []);

  const setDataSource = useCallback((dataSource: string) =>
    setFilters(prev => ({ ...prev, dataSource })), []);

  const resetFilters = useCallback(() => setFilters(defaults), []);

  const hasActiveFilters =
    filters.emirate !== defaults.emirate ||
    filters.sector !== defaults.sector ||
    filters.dateRange !== defaults.dateRange ||
    filters.gender !== defaults.gender ||
    filters.experience !== defaults.experience ||
    filters.nationality !== defaults.nationality ||
    filters.dataSource !== defaults.dataSource;

  return (
    <FilterContext.Provider value={{
      filters,
      setEmirate,
      setSector,
      setDateRange,
      setGender,
      setExperience,
      setNationality,
      setDataSource,
      resetFilters,
      hasActiveFilters,
    }}>
      {children}
    </FilterContext.Provider>
  );
};
